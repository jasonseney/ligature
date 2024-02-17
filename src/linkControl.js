/**
 * # Link Control
 *
 * Provides a control to create,edit,remove, and open links.
 * Mixes in ControlBase to help with the UI of the element
 * within the context of an editor.
 */
var _ = require('lodash');
var $ = require('jquery');
var Velocity = require('velocity-animate');

var Utils = require('./utils');
var SelectionPersistence = require('./selectionPersistence');
var ControlBase = require('./controlBase');
var console = require('./debugConsole');

var LinkControl = (function() {

    var KEY_CODES = { 'shift': 16, 'enter': 13, 'esc': 27, 'delete': 8, 'tab': 9 };

    /**
     * #### Constructor
     * @param {Object} linkConfig A configuration object for various link control options.
     */
    var module = function(linkConfig) {
        this.onChange = ('onChange' in linkConfig && _.isFunction(linkConfig.onChange)) ? linkConfig.onChange : _.noop;
        this.onDismiss  = linkConfig.onDismiss || _.noop;
        this.bypassClasses = ('bypassClasses' in linkConfig && _.isArray(linkConfig.bypassClasses)) ? linkConfig.bypassClasses : [];
        this.maxWidth = ('maxWidth' in linkConfig && _.isNumber(linkConfig.maxWidth) ? linkConfig.maxWidth : 600); // Default to something sane.
        this.minWidth = ('minWidth' in linkConfig && _.isNumber(linkConfig.minWidth) ? linkConfig.minWidth : 200); // Default to something sane.
        this.linkElement = null;
        this.labels = _.extend({}, { // In case you didn't pass in labels, default to English
            'Edit': 'Edit',
            'Remove': 'Remove',
            'Open': 'Open',
            'Done': 'Done'
        }, linkConfig.labels);
        this.actionNames = {
            edit: this.labels['Edit'],
            remove: this.labels['Remove'],
            open: this.labels['Open'],
            done: this.labels['Done']
        };

        setup.call(this);
        ControlBase.call(this); // Need to run extension constructor too!
    };

    // Extensions
    _.assign(module.prototype, ControlBase.prototype);

    /**
     * ### Setup
     */
    function setup() {

        // Init the controls element
        this.element = $('<div />', {
            'class': 'link-bubbles'
        }).css({
            'position':'absolute',
            'top': 0,
            'left': 0
        });

        // Edit
        this.linkUrl = $('<div />', {'class':'url'});

        this.linkEditInput = $('<input />', {'type':'text','placeholder':'http://'});
        this.linkEditDone = $('<div />', {'class':'done'}).text(this.actionNames.done);

        this.linkUrl.hide();
        this.linkUrl.append(this.linkEditInput).append(this.linkEditDone);

        setupOptions.call(this);

        this.element.append(this.linkUrl);
        this.hide();
    }

    /**
     * ### Setup Options
     *
     * Sets up the interface for interacting with a link.
     * Can trigger edit, remove, or open on a link.
     */
    function setupOptions() {

        var linkControl = this;

        var linkOptionHolder = $('<div />', {'class':'options'});

        var options = {
            'edit': function() {
                editLink.call(this);
            },
            'remove': function() {
                var selection = window.getSelection();
                var range = document.createRange();

                range.selectNodeContents(this.linkElement);
                selection.removeAllRanges();
                selection.addRange(range);
                window.document.execCommand('unlink', false, null);
                selection.removeAllRanges();

                this.onChange();
                this.hide();
            },
            'open': function() {
                var linkUrl = $(this.linkElement).attr('href');
                if (linkUrl.indexOf('://') === -1) {
                    linkUrl = 'http://' + linkUrl;
                }

                window.open(linkUrl,'_blank');
            }
        };

        // Create the option elements and their click handlers
        for(var key in options) {
            var option = $('<div />', {
                'class': key
            }).text(this.actionNames[key]);

            $(option).on('click', (function(func) {
                return function() {
                    func.call(linkControl);
                };
            })(options[key]));

            linkOptionHolder.append(option);
        }
        linkOptionHolder.hide();
        $(this.element).append(linkOptionHolder);
    }

    /**
     * ### Edit Link
     *
     * Updates the HREF for the current link element bound to this control.
     *
     */
    function editLink() {
        if(!this.linkElement) {
            console.error('Cannot edit link without a valid linkElement');
        }

        var linkElement = this.linkElement;

        runLinker.call(this, function(value) {
            $(linkElement).attr('href', value);
        },$(linkElement).attr('href'));
    }

    /**
     * ### Run Linker
     *
     * Will show the link input and handle user input. We use `onDone" because
     * sometimes we're creating a _new_ link, other times we're updating an
     * existing link element's href value.
     *
     * @param {Function} onDone Callback to execute when user enters the link.
     * @param {String} [initValue] A value to initialize the input to.
     */
    function runLinker(onDone, initValue) {

        if(initValue) {
            this.linkEditInput.val(initValue);
            this.linkUrl.addClass('modified');
        }

        var linkControl = this;

        // Runs the callback with the trimmed input value
        var saveLink = function() {
            var value = $(linkControl.linkEditInput).val().trim();

            onDone(value);

            // Clean up
            linkControl.onChange();
            linkControl.close();
        };

        // On ENTER key, save the link
        $(this.linkEditInput).on('keydown', function(e) {

            linkControl.linkUrl.addClass('modified');

            if(e.keyCode === KEY_CODES.enter) {
                e.preventDefault();
                saveLink();
            } else if(e.keyCode === KEY_CODES.esc) {
                linkControl.close();
                linkControl.onDismiss();
                e.stopPropagation();
            }
        });

        $(this.linkEditInput).on('keyup', function(e) {
            if(e.keyCode !== KEY_CODES.esc && e.keyCode !== KEY_CODES.enter) {
                updateSize.call(linkControl);
            }
        });

        $(this.linkEditInput).on('paste', function(e) {
            linkControl.linkUrl.addClass('modified');
            updateSize.call(linkControl);
        });

        // When clicking done, save the link
        this.linkEditDone.on('click', function(e) {
            e.preventDefault();
            saveLink();
        });

        // Update UI
        this.element.find('.options').hide();

        this.linkUrl.show();
        this.show();

        updateSize.call(this);

        $(this.linkEditInput).focus();

    }

    /**
     * ### updateSize
     *
     * This updates the size of the current link control based on the value of the input.
     * It uses the control's own attributes to constrain within a minimum and maximum value.
     * The control should also maintain it's original "center" position while growing/shrinking.
     */
    function updateSize() {

        var value = $(this.linkEditInput).val();

        // Account for the button width in the control
        var buttonWidth = $(this.linkEditDone).outerWidth();

        // Account for padding on the url control itself
        var padding = $(this.linkUrl).outerWidth() - $(this.linkUrl).width();

        // Calc the text width for the input
        var textWidth = Utils.calcTextWidth($(this.linkEditInput).get(0), value);

        // Add space for a single char so the input doesn't scroll back before expanding
        var singleCharWidth = Utils.calcTextWidth($(this.linkEditInput).get(0), 'A');

        // This is the width that the entire url and internals take up
        var desiredWidth =  textWidth + buttonWidth + padding + singleCharWidth;

        // Constrain to min/max width
        var newWidth = desiredWidth < this.minWidth ? this.minWidth : desiredWidth;
        newWidth = newWidth > this.maxWidth ? this.maxWidth : newWidth;

        var $el = $(this.element);

        var widthChange = newWidth - $el.width();

        if(widthChange !== 0) {

            // Keep the link control centered by offsetting it when expanding
            var offset = Math.floor(widthChange / 2);

            // Slight animation to make sizing less jarring
            Velocity($el, {
                width: newWidth,
                left: '-=' + offset
            }, { duration: 40, easing: 'ease' });

        }
    }

    /**
     * ## Create Link
     *
     * Creates a new link for a "smart selection". Will open the link input control and run the `createLink` command after the user enters a link.
     *
     * @param {Object} smartSelection A smart selection object to use for creating a link.
     */
    module.prototype.createLink = function(smartSelection) {
        runLinker.call(this, function(value) {
            SelectionPersistence.restoreSelection(smartSelection);
            window.document.execCommand('createLink', false, value);

            // Collapse to end of selection
            var endSelection = window.getSelection();
            var endRange = endSelection.getRangeAt(0);
            endRange.collapse(false);
            endSelection.removeAllRanges();
            endSelection.addRange(endRange);
        });

    };

    /**
     * ## Show Options
     * Shows the interface to interact with a link
     * @param {Element} linkElement The element for link we want to interact with.
     */
    module.prototype.showOptions = function(linkElement) {
        this.linkElement = linkElement;
        this.linkUrl.hide();
        this.element.css({
            'width': '',
            'left': 0
        });
        this.element.find('.options').show();
    };

    /**
     * ## Close
     * Closes this control and resets all values.
     */
    module.prototype.close = function() {
        this.linkUrl.hide();
        this.element.find('.options').hide();
        this.element.css('width','');

        // These get re-bound each time runLinker is called
        this.linkEditInput.val('').unbind();
        this.linkEditDone.unbind();

        this.linkUrl.removeClass('modified');
        this.linkElement = null;
        this.hide();
    };

    /**
     * ## Is Valid Link
     * Determines if the provided link is valid for Link Control
     * @param {Element} linkElement The link element in question
     * @return {Boolean}
     */
    module.prototype.isValidLink = function(linkElement) {
        if (!linkElement) return false;

        /**
         * If any of the bypass classes are on the linkElement
         * return false, not a valid link
         */
        return !_.some(this.bypassClasses, function(bypassClass) {
            return $(linkElement).hasClass(bypassClass);
        });
    };

    return module;

})();

module.exports = LinkControl;
