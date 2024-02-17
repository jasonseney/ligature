/**
 * # Smart Quoter
 *
 * Converts normal quotes to "smart quotes".
 *
 * This will override key presses for the `"` and `'` characters and replace with curly double `“ ”` and single `‘ ’` quotes. This will also insert double `″` and single `′` primes.
 *
 * ## Rules:
 *
 * - If at the beginning of a node or after a space, insert opening quote
 * - If after a number, use double or single prime.
 * - Otherwise, insert a closing quote
 *
 * ### IMPORANT
 *
 * Currently, this is disabled for IE, until we're able to improve how we update the range.
 */
var _ = require('lodash');
var $ = require('jquery');
var SelectionContext = require('./selectionContext');
var SelectionPersistence = require('./selectionPersistence');
var Utils = require('./utils');

var SmartQuoter = (function() {

    /**
     * #### Constructor
     *
     * @param {Editor} editor An instance of a Ligature text editor.
     */
    var module = function(editor, config) {

        if(Utils.browser.msie) {
            return null;
        }

        this.editor = editor;
        this.config = {
            openingMatches : [/\s/,/\u200B/,/[=]/],
                singleQuotes : {
                    open: '\u2018',
                    close: '\u2019',
                prime: '\u2032'
            },
            doubleQuotes: {
                open: '\u201C',
                close: '\u201D',
                prime: '\u2033'
            }
        };
        _.extend(this.config, config || {});
        setupKeyHandlers.call(this);
    };

    function setupKeyHandlers() {
        var quoter = this;
        $(this.editor.element).on('keypress', function(e) {
            var didReplace = false;
            if (e.charCode === 34) {
                didReplace = doDoubleQuote.call(quoter);
            } else if (e.charCode === 39) {
                didReplace = doSingleQuote.call(quoter);
            } else {
                return;
            }
            if(didReplace) {
                e.preventDefault();
            }
        });
    }

    function doSingleQuote() {
        var quotes = this.config.singleQuotes;
        return doQuote.call(this, quotes.open, quotes.close, quotes.prime);
    }

    function doDoubleQuote() {
        var quotes = this.config.doubleQuotes;
        return doQuote.call(this, quotes.open, quotes.close, quotes.prime);
    }

    /**
     * ### doQuote
     *
     * Runs the actual replacement of quote in a selection.
     * @param {string} openChar The character use for opening quotes.
     * @param {string} closeChar The character use for closing quotes.
     * @param {string} primeChar The character use after a number.
     */
    function doQuote(openChar, closeChar, primeChar) {

        var selection = SelectionContext.getSelection();

        // Only run smart quotes when we're in a cursor - at least until we can properly
        // combine nodes within a selected range.
        if(!selection.isCollapsed) {
            return false;
        }

        var node = selection.anchorNode;
        node.normalize();

        var savedSel = SelectionPersistence.saveSelection(node);

        // Slice up the string into the parts before and after selection
        var fullStr = node.textContent;
        var beforeStr = fullStr.slice(0, savedSel.start);

        // Grab the character immediately before the selection, and the last line break
        var prevChar = beforeStr.charAt(beforeStr.length - 1);
        var lastBr = node.lastChild && node.lastChild.nodeName === 'BR' ? node.lastChild : null;

        // Check if we should use an opening quote
        // (character match or <br> element at the end of the node
        var isOpeningChar = _.any(this.config.openingMatches, function(match) {
            return match.test(prevChar);
        }) || lastBr;

        var charToInsert = '';

        if (!prevChar || isOpeningChar) {
            // keyed single quote at start
            charToInsert = openChar;
        } else if (/\d/.test(prevChar)) {
            // keyed after a number, add prime
            charToInsert = primeChar;
        } else {
            // keyed after something "else", use closing quote
            charToInsert = closeChar;
        }


        // Reassemble the node's text
        var newNode = document.createTextNode(charToInsert);
        var range = selection.getRangeAt(0);
        range.deleteContents();

        // @NOTE: This behaves differently in IE, and therefor this library is
        // not recommended for IE until we're able to accurately update the range across
        // all browsers
        range.insertNode(newNode);

        // If there are two trailing `<br>`s, we need to truncate it to emulate what the
        // browser does if you start typing on a new line. Yes this seems weird, but it prevents
        // us from adding an extra line. Note: IE only has one BR.
        if(lastBr && lastBr.previousSibling && lastBr.previousSibling.nodeName === 'BR') {
            $(lastBr).remove();
        }

        range.setEndAfter(newNode);
        range.collapse(false);

        // Update selection
        selection.removeAllRanges();
        selection.addRange(range);

        return true;
    }

    return module;

})();

module.exports = SmartQuoter;
