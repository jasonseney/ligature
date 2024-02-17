/**
 * # Plain Text Editor
 *
 * A class to implement a basic plain text editor similar to `<textarea>`,
 * while enabling the implementor to edit internal HTML.
 */
var _ = require('lodash');
var $ = require('jquery');

var DataFilter = require('./dataFilter');
var SelectionPersistence = require('./selectionPersistence');
var SelectionContext = require('./selectionContext');
var UndoManager = require('./undoManager');
var SmartQuoter = require('./smartQuoter');
var KeyComboEvents = require('./keyComboEvents');
var console = require('./debugConsole');

var PlainTextEditor = (function() {

    // Static vars
    var EMPTY_DATA = '<span>&#8203;</span>';
    var EMPTY_DATA_UNICODE = '<span>\u200B</span>';
    var ZERO_WIDTH_GLOBAL_REGEX = /\u200B/g;
    var KEY_CODES = { 'shift': 16, 'enter': 13, 'esc': 27, 'backspace': 8, 'delete': 46, 'tab': 9, 'right': 39 };

    /**
     * ## Constructor
     *
     * Set up an instance of an editor.
     *
     * #### Config format:
     *
     * - **placeholder** (string to use as placeholder or false)
     * - **onChange** (function to run when the editor's data changes)
     * - **onSelection** (function to run when the editor's select context changes)
     * - **onClientEvent** (function to run when keyboard/mouse events are triggered)
     * - **pasteHook** Function to run with clipboard data when pasting. Return `true` to stop default paste behavior.
     * - **filterForSetData Function run on html before being set.
     * - **filterForGetData Function run on html as it as fetched.
     * - **filterRules** (object)
     *      - elements (array of allowed element names)
     *      - attributes (hash of element names and array of allowed attribtues)
     *      - remove_contents (array of elements to completely remove)
     *      - protocols (hash of element names with hash of attributes with array of allowed protocols)
     *
     * @param {object} element The element that is editable. Any HTML in here is auto loaded.
     * @param {object} config The configuration settings for the editor.
     * @return A new shiny editor!
     */
    var module = function(element, config) {

        if (!element) {
            throw new Error('A valid element parameter is required to initalize the editor');
        }

        this.element = element;

        this.keyComboEvents = config.keyComboEvents || new KeyComboEvents({
            element: this.element
        });

        // don't execute the contenteditable commands
        this.keyComboEvents.on('meta+b meta+i meta+k meta+u', _.noop);

        this.config = {
            placeholder: false,
            onChange: function(){},
            onSelection: function(selection){},
            onClientEvent: function(e){},
            pasteHook: function(clipboardData, shiftKey) { return false; },
            filterForSetData: function(html) { return html; },
            filterForGetData: function(html) { return html; },
            filterRules: {
                elements: ['p','br', 'div'],
                attributes: {},
                remove_contents: ['style','noscript','script', 'meta'],
                protocols: {}
            },
            forceSingleLine: false,
            smartQuotes: {
                enabled: false,
                config: { }
            },
        };

        _.extend(this.config, config || {});

        this.dataFilter = new DataFilter(this.config.filterRules);

        this.onChange = function() {
            if (this.previousRawData !== getRawData.call(this)) {
                wrapAllTextNodes.call(this);
                runPlaceholder.call(this);
                this.config.onChange.apply(this, arguments);
                this.previousRawData = getRawData.call(this);
            }
        };

        this.keyModifiers = {
            shift: false
        };

        this.undoManager = new UndoManager(this);

        if (this.config.smartQuotes.enabled) {
            this.smartQuoter = new SmartQuoter(this);
        }

        setupUI.call(this);
    };

    /**
     * ### Setup UI
     *
     * Adds the basic required elements to the DOM.
     */
    function setupUI() {

        setRawData.call(this, EMPTY_DATA);

        // Wrap the editor in a wrapper so we can jam fun stuff in here.
        var wrapper = $('<div />', {
            'data-js': 'editor-wrapper',
            'class': 'editor-wrapper',
        }).css('position', 'relative');

        var slot = $('<div />', {
            'data-js': 'editor-slot',
            'class': 'editor-slot',
        }).css('position', 'relative');

        $(this.element).wrap(wrapper).wrap(slot);

        // Add placeholder element
        this.placeholderElement = $('<div />', {
            'data-js': 'editor-placeholder',
            'class': 'editor-placeholder',
        }).css('position', 'absolute');

        slot = $(this.element).parent();
        slot.append(this.placeholderElement);

        runPlaceholder.call(this);
        initInterfaceEvents.call(this);
    }

    /**
     * ### Initialize Interface Events
     * Sets up the user interaction events and delegates to editor methods.
     */
    function initInterfaceEvents() {

        var editor = this;

        // Keyboard content change wrapper (called from within key handlers)
        var updateContentAndInterface = function() {
            cleanupZeroWidth.call(this);
            runSelectionOrCursor.call(this);
            this.onChange();
        };

        $(this.element).on('input keydown keyup keypress mousedown mouseup', function(e) {
            editor.config.onClientEvent.call(editor, e);
        });

        // Bind key down event to our internal key commands
        $(this.element).on('keydown', function(e) {
            if (e.keyCode === KEY_CODES.shift) {
                editor.keyModifiers.shift = true;
            } else if (e.keyCode === KEY_CODES.backspace) {
                enforceBlockContext.call(editor);
            } else if (e.keyCode === KEY_CODES.enter) {
                if (!editor.config.forceSingleLine && !e.metaKey) {
                    insertLineBreak.call(editor, this, false); // TODO: This might be true if editor is empty
                }
                e.preventDefault();
                // Prevent `editor.onChange` below because the selection change
                // caused by `insertLineBreak` will trigger it instead
                return;
            }

            /**
             * We want to run the placeholder after the value is changed
             * by the browser, but we need to wait a bit before this event
             * completes and the DOM is updated.
             */
            _.defer(function() {
                editor.onChange(e);
            });
        });

        $(this.element).on('keyup', function(e) {
            if (e.keyCode === KEY_CODES.shift) {
                editor.keyModifiers.shift = false;
            } else if (e.keyCode === KEY_CODES.enter) {
                enforceBlockContext.call(editor);
            } else if (e.keyCode === KEY_CODES.backspace || e.keyCode === KEY_CODES['delete']) {
                _.defer(function() {
                    enforceBlockContext.call(editor);
                });
            }
            updateContentAndInterface.call(editor);
        });

        /**
         * Other events that could potentially trigger content changes.
         * "input" for non-keyboard content changes in modern browsers (emoji menu, spellcheck, etc.)
         * "blur" as a fallback for "input" in IE and older versions of FF
         */
        $(this.element).on('input', function(e) {
            updateContentAndInterface.call(editor);
        });

        $(this.element).on('blur', function(e) {
            editor.onChange();
        });

        // Mouse Events
        // Will check context if mouse up on here OR mouse down then leaving
        var doingMouseyStuff = false;
        $(this.element).on('mouseup', function() {
            doingMouseyStuff = false;
            runSelectionOrCursor.call(editor);
        });

        $(this.element).on('mousedown', function(e) {
            doingMouseyStuff = true;
        });

        $(this.element).on('mouseleave', function() {
            if (doingMouseyStuff) {
                runSelectionOrCursor.call(editor);
            }
        });

        // We want to override the default paste behavior and insert the client data ourselves.
        $(this.element).on('paste', function(e) {
            var clipboardData = (e.originalEvent || e).clipboardData;
            if (!editor.config.pasteHook(clipboardData, editor.keyModifiers.shift)) {
                insertClientData.call(editor, clipboardData, e);
            }
            e.preventDefault();
        });

        /* Disable drop events completely.
         * @Note: If you want to ever enable drag and drop text, this would be the place -
         * however it is extremely difficult to handle cross browser selection issues during drag
         * and drop for a reliable and consistent experience.
         */
        $(this.element).on('drop', function(e) {
            e.stopPropagation();
            e.preventDefault();
        });

        // Manually focus the editor element when the placeholder element is clicked
        this.placeholderElement.on('click', function() {
            if (editor.isEmpty()) {
                $(editor.element).focus();
            }
        });

        $(this.element).on('focus', function() {
            _.defer(function() { editor.onChange(); });
        });
    }

    /**
     * ### Run Selector or Cursor
     *
     * Checks the selection and calls the appropiate editor method.
     */
    function runSelectionOrCursor() {
        var editor = this;
        setTimeout(function() {
            var selection = SelectionContext.getSelection();
            editor.config.onSelection.call(editor, selection);
        }, 200);
        // Browsers are weird. Selections that are collapsed were being reported is not collpased.
        // Example: Clicking inside a current selection, it should be a "cursor".
        // The delay above seems to fix that?

        // Any selection or cursor causes link control to close
    }

    /**
     * ### Run Placeholder
     * Handles the functionality for placeholder on this editor instance.
     */
    function runPlaceholder() {
        var newValue = this.isEmpty() ? this.config.placeholder : '';
        var $placeholder = $(this.placeholderElement);
        $placeholder.html(newValue);

        var placeholderHeight = $placeholder.outerHeight();
        // make sure the editor element is at least the height of the placeholder text
        if (placeholderHeight) {
            $(this.element).css('min-height', Math.max(parseInt($placeholder.css('min-height'), 10) || 0, placeholderHeight));
        }
    }

    /**
     * ### Insert Client Data
     * Takes the clipboard data, filters it, and inserts into the editor.
     * @param {object} clientData The clipboard data from the browser to use.
     */
    function insertClientData(clientData, e) {
        var data = '';

        if (_.contains(clientData.types, 'text/plain')) {
            data = clientData.getData('text/plain');
            data = this.dataFilter.filterPlaintext(data);
            insertDataAtCursor.call(this, data);
        }
        else if (_.contains(clientData.types, 'text/html')) {
            data = clientData.getData('text/html');
            data = this.dataFilter.filterHTML(data);

            // Convert to standard \n line breaks
            var dataLined = data
                .replace(/<br(\s*)\/*>/ig, '\n')    // replace single line-breaks
                .replace(/(<[p|div])/ig, '\n$1');   // add a line break before all div and p tags

            var doc = document.implementation.createHTMLDocument('');
            doc.body.innerHTML = dataLined;
            var dummyNode = doc.body;

            // cross-browser innerText (FF does not support innerText)
            var dummyContent = dummyNode.textContent || dummyNode.innerText || '';

            // Get the text with standard line breaks only and convert to <br>
            var output = dummyContent.split('\n').join('<br>');

            insertDataAtCursor.call(this, output);
        }
        else {
            return;
        }

        // If single line mode, strip out the HTML line breaks
        if (this.config.forceSingleLine) {
            var inlinedText = getRawData.call(this).replace(/<br\s*\/*>/g, ' ');
            setRawData.call(this, inlinedText);
        }

        this.onChange(e);
    }

    /**
     * Wrap All Text Nodes
     *
     * Runs through all contents in the editor and wraps text nodes in <span>.
     * This allows us to do more with the text contont inside with CSS.
     */
    function wrapAllTextNodes() {
        $(this.element).contents().filter(function() {
            return this.nodeType === 3;
        }).wrap('<span></span>');
    }

    /**
     * ### Set Raw Data
     * Directly inserts HTML into the editor (unfiltered)
     */
    function setRawData(data) {
        $(this.element).html(data);
    }

    /**
     * ### Get Raw Data
     * @return {String} The HTML data inside this editor.
     */
    function getRawData() {
        return $(this.element).html().trim();
    }

    /**
     * ### Insert Data
     * Inserts data at the current cursor location (or replaces selecion).
     * @param {String} data The data (HTML or plain text) to insert
     */
    function insertDataAtCursor(data) {

        // Remove last linebreak
        data = data.replace(/[<]br\s?\/?[>]$/, '');

        data = this.dataFilter.convertToBrowserSpaces(data);

        if (!data) {
            console.warn('Cannot insert empty data');
            return;
        }

        var selection = SelectionContext.getSelection();

        if (!selection || !selection.focusNode) {
            console.warn('Cannot insert without the editor having a cursor or selection');
            return;
        }

        var range = selection.getRangeAt(0);
        range.deleteContents();

        var frag = range.createContextualFragment(data);
        range.insertNode(frag);

        // Set the cursor to the end of this new range
        selection.removeAllRanges();
        range.collapse(false);
        selection.addRange(range);
    }

    /**
     * Insert Line Break
     *
     * Creates a new line break using <br> only.
     */
    function insertLineBreak(editorElement, skipLast) {
        // If this is the last element that's not a linebreak, stick a line break at the end for the cursor to move to

        if (!skipLast && (!editorElement.lastChild || editorElement.lastChild.nodeName.toLowerCase() !== 'br')) {
            editorElement.appendChild(document.createElement('br'));
        }

        var selection = SelectionContext.getSelection();
        if (selection) {
            var range = selection.getRangeAt(0);

            var lineBreak = document.createElement('br');
            range.deleteContents();
            range.insertNode(lineBreak);
            range.setStartAfter(lineBreak);
            range.setEndAfter(lineBreak);
            range.collapse(false);

            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function zeroWidthReplace(rootNode) {
        $(rootNode).contents().each(function(i, node) {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = node.textContent.replace(ZERO_WIDTH_GLOBAL_REGEX, '');
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                zeroWidthReplace(node);
            }
        });
    }

    /**
     * ### cleanupZeroWidth
     *
     * Removes any lingering zero-width characters from the context block,
     * preserving the cursor position
     */
    function cleanupZeroWidth() {
        // If we're empty, we want to keep zero-width characters
        if (this.isEmpty()) {
            return;
        }

        var el = getContextElement.call(this);

        // Do we have any context to work with?
        if (!(el && el.nodeType === Node.ELEMENT_NODE)) {
            return;
        }

        // Do we have any zero-width characters?
        var text = el.textContent || el.innerText || '';
        var matches = text.match(ZERO_WIDTH_GLOBAL_REGEX);
        if (!matches) {
            return;
        }

        // Shift the selection if any preceding zero-width characters are removed
        var selection = SelectionPersistence.saveSelection(el);
        selection.start -= (text.substr(0, selection.start).match(ZERO_WIDTH_GLOBAL_REGEX) || '').length || 0;
        selection.end -= (text.substr(0, selection.end).match(ZERO_WIDTH_GLOBAL_REGEX) || '').length || 0;
        // Strip all zero-width/characters
        zeroWidthReplace(el);

        // Restore the selection
        SelectionPersistence.restoreSelection(selection);
    }

    /**
     * ### getContextElement
     *
     * Finds the element that is "in context".
     * This is either the parent of wherever the cursor is
     * or the last element in the editor if no cursor.
     *
     * @return {object} A node for the block element in context.
     */
    function getContextElement() {

        // Try to get the nearest node in our "context"
        var node = getRootElement.call(this);

        if (!node) {

            // Otherwise, there's no context, so lets use the last block! xD

            var allBlocks = $(this.element).children();
            if (!allBlocks.length) {
                // Hopefully this doesn't happen, but if it does we have `enforceBlockContext()` to save us
                return null;
            }
            // Otherwise, use the last one
            node = allBlocks.last().get(0);
        }
        return node;
    }

    /**
     * ### getRootElement
     * Searchs through an ordered node list for the closest element.
     *
     * @param {object[]} [nodeList] The list of nodes, ordered from closest to farthest.
     * @return {object} The nearest "block" node or undefined if not found
     */
    function getRootElement(nodeList) {
        if (!nodeList) {
            if (!SelectionContext.getSelection() && this.lastSelection) {
                nodeList = SelectionContext.getParentNodes(this.lastSelection.anchorNode);
            } else {
                nodeList = SelectionContext.getNodeList();
            }
        }

        return _.find(nodeList.reverse(), function(node) {
            return node.nodeType === Node.ELEMENT_NODE;
        });
    }

    /**
     * ### enforceBlockContext
     *
     * Ensures that we have the minimum empty data in the editor. Use as needed after setting data.
     */
    function enforceBlockContext() {
        if (this.isEmpty()) {
            setRawData.call(this, EMPTY_DATA);
            this.setCursorToEnd();
        }
    }

    /**
     * ## Get Data
     * @param {Boolean} trim Should we trim the output?
     * @return The HTML in the editor.
     */
    module.prototype.getData = function(trim) {
        var data = getRawData.call(this);

        data = this.config.filterForGetData.call(this, data);

        var dataLined = data
            .replace(/<br(\s*)\/*>/ig, '\n')    // replace single line-breaks
            .replace(/(<[p|div])/ig, '\n$1')    // add a line break before all div and p tags
            .replace(ZERO_WIDTH_GLOBAL_REGEX, ''); // remove zero-width chars

        var dummyNode = document.createElement('div');
        dummyNode.innerHTML = dataLined;

        // cross-browser innerText (FF does not support innerText)
        var dummyContent = dummyNode.textContent || dummyNode.innerText || '';
        var output = trim ? dummyContent.trim() : dummyContent;

        return output;
    };

    /**
     * ## Set Data
     *
     * Filters and sets the data into the editor. Will overwrite any
     * data currently in the editor. If you want to set the HTML
     * itself without pre-processing, use `setHTML()` instead.
     *
     * @param {String} data The HTML to set in the editor.
     */
    module.prototype.setData = function(data) {
        data = this.config.filterForSetData.call(this, data);

        data = this.dataFilter.filterPlaintext(data);
        setRawData.call(this, data);

        enforceBlockContext.call(this);
        this.onChange();
    };

    /**
     * ## Set HTML
     *
     * An _advanced_ low level function to set the HTML for this editor instance.
     *
     * **Important:** This does _not_ trigger the onChange as it is designed to
     * update the editor's markup state, not use for normal data.
     */
    module.prototype.setHTML = function(html) {
        setRawData.call(this, html);
        this.onChange();
    };

    /**
     * ## Get HTML
     *
     * Low level function to get the actual HTML of the editor instance.
     *
     * **Important:** Don't rely on this for getting data out of the editor for human use,
     * is provided to allow formatting of the markup in the editor.
     *
     * _If you're not sure if you need this, use `getData()` instead!_
     */
    module.prototype.getHTML = function() {
        return getRawData.call(this);
    };

    /**
     * ## Insert Data
     * Inserts data in the editor within the current context.
     *
     * @param {String} data The HTML to insert in the editor.
     * @param {Boolean} runFilter Flag to run the HTML filter on input.
     */
    module.prototype.insertData = function(data, runFilter) {
        if (runFilter) {
            data = this.dataFilter.filterHTML(data);
        }
        insertDataAtCursor.call(this, data);
        this.onChange();
    };

    /**
     * ### blur
     * call jQuery blur on the editor element
     */
    module.prototype.blur = function() {
        return $(this.element).blur();
    };

    /**
     * ### focus
     * call jQuery focus on the editor element
     *
     * @param {Boolean} skipSelection (optional) Pass true to bypass selecting first item after focus
     * @return {jQuery} the editor jQuery element
     */
    module.prototype.focus = function(skipSelection) {
        var $element = $(this.element).focus();
        if (!skipSelection) {
            this.setCursorToEnd();
        }
        return $element;
    };

    /**
     * ## Has focus
     * Does the editor have focus?
     *
     * @return {Boolean}
     */
    module.prototype.hasFocus = function() {
        return $(this.element).is(':focus');
    };

    /**
     * ## Set Placeholder
     *
     * @param  {String|Boolean} value The placeholder text to set in the editor. Pass false to disable.
     */
    module.prototype.setPlaceholder = function(value) {
        this.config.placeholder = value;
        runPlaceholder.call(this);
    };

    /**
     * ## Is Empty
     *
     * Returns _true_ if the editor contains placeholder or no data
     * (Considers the initial `EMPTY_DATA` html and any placeholder markup as empty)
     * @return {Boolean}
     */
    module.prototype.isEmpty = function() {
        var text = this.getData(false);

        if ((text === '') || (text === '\n') || (text === '\r\n')) {
            return true; // sometimes an edited contenteditable will have a phantom newline
        }

        var data = getRawData.call(this);
        return data === EMPTY_DATA || data === EMPTY_DATA_UNICODE || data === '';
    };

    module.prototype.getCurrentElement = function() {
        return SelectionContext.getNearestElement();
    };

    module.prototype.setCursorToStart = function(el) {
        var $editor = $(this.element);
        el = (el && $editor.find(el).first().get(0)) || $editor.children().first().get(0);
        if (el) {
            SelectionPersistence.setToStart(el);
        }
    };

    module.prototype.setCursorToEnd = function(el) {
        var $editor = $(this.element);
        el = (el && $editor.find(el).last().get(0)) || $editor.children().last().get(0);
        if (el) {
            SelectionPersistence.setToEnd(el);
        }
    };

    /**
     * ## teardown
     */
    module.prototype.teardown = function() {
        this.undoManager.teardown();
        this.keyComboEvents.off();
    };

    return module;
})();

module.exports = PlainTextEditor;
