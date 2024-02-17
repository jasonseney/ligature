/**
 * # Rich Text Editor
 *
 * A class to create a rich text editor with formatting tools.
 */
var _ = require('lodash');
var $ = require('jquery');
var animate = require('velocity-animate').animate;

var LinkControl = require('./linkControl');
var FormattingControls = require('./formattingControls');
var DataFilter = require('./dataFilter');
var SelectionPersistence = require('./selectionPersistence');
var SelectionContext = require('./selectionContext');
var InlineControls = require('./inlineControls');
var Utils = require('./utils');
var UndoManager = require('./undoManager');
var SmartQuoter = require('./smartQuoter');
var KeyComboEvents = require('./keyComboEvents');
var HumanKeys = require('./humanKeys');
var createObjectURL = (window.URL || window.webkitURL || window.mozURL || window.msURL || {}).createObjectURL;
var console = require('./debugConsole');

var RichTextEditor = (function() {

    // Static vars
    var EMPTY_DATA = '<p><br></p>'; // Use this for enforce "P" mode not DIVs
    var EMPTY_PARAGRAPH = '<p></p>'; // Sometimes the browser makes these. Treat as empty.
    var BLOCK_ELEMENTS = ['P', 'FIGURE', 'H2', 'BLOCKQUOTE', 'UL', 'OL', 'DIV', 'PRE'];
    var FORMATTED_BLOCKS = ['H2', 'BLOCKQUOTE', 'PRE'];
    var PRE_FORMATTED_ELEMENTS = ['PRE'];
    var INDENTED_ELEMENTS = ['UL','OL'];
    var TEXT_BLOCKS = ['P', 'H2', 'BLOCKQUOTE', 'UL', 'OL', 'PRE'];
    var MEDIA_ELEMENTS = ['IMG','IFRAME', 'FIGURE', 'HR'];
    var KEY_CODES = {
        'shift': 16,
        'enter': 13,
        'esc': 27,
        'backspace': 8,
        'delete': 46,
        'tab': 9,
        'right': 39,
        'metaLeft': 91,
        'metaRight': 93,
        'leftArrow': 37,
        'rightArrow': 38,
        'upArrow': 39,
        'downArrow': 40
    };

    /**
     * ## Constructor
     *
     * Set up an instance of an editor.
     *
     * #### Config format:
     *
     * - **placeholder** (string to use as placeholder or false)
     * - **characterLimit** (integer maximum characters allowed in editor)
     * - **onChange** (function to run when the editor's data changes)
     * - **onSelection** (function to run when the editor's select context changes)
     * - **onClientEvent** (function to run when keyboard/mouse events are triggered)
     * - **onAsyncImageAdded** (function called after some async media is added to editor)
     *      - key The key for the corresponding media reference
     *      - source The source used to _display_ the image.
     *      - file The file used to add this image. (Optional)
     * - **onAsyncImageFailed** (currently only called when source or file is not valid)
     * - **runIFrameSanitization** (A flag to turn on iframe sanitization of source. Used to break frame breakers.)
     * - **pasteHook** Function to run with clipboard data when pasting. Return `true` to stop default paste behavior.
     * - **filterForSetData Function run on html before being set (only when runFilter is true in setData).
     * - **filterForGetData Function run on html as it as fetched.
     * - **filterRules** (object)
     *      - elements (array of allowed element names)
     *      - attributes (hash of element names and array of allowed attribtues)
     *      - remove_contents (array of elements to completely remove)
     *      - protocols (hash of element names with hash of attributes with array of allowed protocols, i.e. http://)
     * - **labels** (object of string translations; currently w/ translations: Edit, Remove, Open, and Done)
     *
     * @param {object} element The element that is editable. Any HTML in here is auto loaded.
     * @param {object} config The configuration settings for the editor.
     * @return A new shiny editor!
     */
    var module = function(element, config) {

        if (!element) {
            throw new Error('A valid element parameter is required to initalize the editor');
        }

        config = config || {};

        this.element = element;

        // for translating key commands into nice tooltips
        this.humanKeys = new HumanKeys();

        // for capturing keyboard events and turning them into combos (e.g. meta+shift+k)
        this.keyComboEvents = config.keyComboEvents || new KeyComboEvents({
            element: this.element,
            humanKeys: this.humanKeys
        });

        // helper function for contextual controls tooltip
        var tooltipTemplate = _.template('<%= title %> (<%= shortcut %>)');
        var t = _.bind(function (title, shortcut) {
            return tooltipTemplate({ title: title, shortcut: this.humanKeys.pretty(shortcut) });
        }, this);

        this.config = {
            labels: {},
            placeholder: false,
            characterLimit: null,
            onChange: _.noop,
            onSelection: function(selection){},
            onAsyncImageAdded: function(key, source, file, attributes){ },
            onAsyncImageFailed: function() {
                console.warn('Unknown source type for inserting an image.');
            },
            onFileAdded: function(file, targetNode, direction) { },
            onClientEvent: function(e){},
            flattenBlocks: true,
            smartQuotes: {
                enabled: false,
                config: { }
            },
            runIFrameSanitization: false,
            mediaHolderClass: 'media-holder',
            mediaHolderCallback: function(editor, el, $el, $mediaHolder) {
                if ($el.is('hr, img, figure') && _.isEmpty($el.find('iframe'))) {
                    $mediaHolder.addClass('media-holder-draggable');
                }
                $mediaHolder.addClass('media-holder-' + $el.prop('tagName').toLowerCase());
            },
            mediaHolderEvents: {
                keydown: _.noop,
                keyup: _.noop,
                mousedown: _.noop,
                mouseup: _.noop,
                mouseenter: _.noop,
                mouseleave: _.noop,
                click: _.noop,
                dragstart: _.noop
            },
            imgKeyAttr: 'data-img-key',
            imgSizeAttrs: {
                width: 'data-orig-width',
                height: 'data-orig-height'
            },
            addImgAttrs: {
                toImg: false,
                toImgParent: false
            },
            fakeClass: 'fake',
            mediaKillerMarkup: '<div>×</div>',
            mediaMoverMarkup: '<div>&#8597;</div>',
            pasteHook: function(clipboardData, shiftKey) { return false; },
            blurHook: function(e) { return false; },
            documentMousedownHook: function(e) { return false; },
            filterForSetData: function(html) { return html; },
            filterForGetData: function(html) { return html; },
            filterRules: {
                elements: ['a', 'b', 'i', 'ul', 'ol', 'li', 'p', 'h2', 'blockquote', 'img', 'iframe', 'figure', 'br', 'hr', 'pre', 'sub', 'sup', 'small'],
                attributes: {
                    a: ['href', 'title'],
                    img: ['src', 'alt', 'data-orig-width', 'data-orig-height'],
                    hr: ['data-label'],
                    iframe: ['src','width','height', 'frameborder'],
                    figure: ['data-orig-width', 'data-orig-height']
                },
                classnames: {
                    hr: ['read-more']
                },
                remove_contents: ['style','noscript','script', 'meta'],
                protocols:  {
                    a: { href: ['http', 'https', 'mailto'] }
                }
            },
            animateShowControls: function(controls) {
                controls.element.show();
            },
            animateHideControls: function(controls) {
                controls.element.hide();
            },
            linkConfig: {
                bypassClasses: [],
                labels: config.labels,
                onChange: function() {
                    this.onChange.call(this);
                },
                onDismiss: function () {
                    if (this.lastSelection) {
                        SelectionPersistence.restoreSelection(this.lastSelection);
                        runInterfaceUpdate.call(this);
                    }
                }
            },
            inlineControlsConfig: {
                openTray: InlineControls.prototype.openTray,
                closeTray: InlineControls.prototype.closeTray,
                onTrayOpened: function(intentTriggered){},
                onTrayClosed: function(intentTriggered){},
                keyboardEvents: this.keyComboEvents
            },
            formattingControlsConfig: {
                controls: {
                    bold: {
                        el: 'b',
                        className: 'bold',
                        command: 'bold',
                        type: 'inline',
                        title: t('Bold', 'meta+b'),
                        keyboard: 'meta+b'
                    },
                    italic: {
                        el: 'i',
                        className: 'italic',
                        command: 'italic',
                        type: 'inline',
                        title: t('Italic', 'meta+i'),
                        keyboard: 'meta+i'
                    },
                    headline: {
                        el: 'h2',
                        className: 'headline',
                        command: 'formatBlock',
                        type: 'block',
                        title: t('Headline', 'meta+shift+2'),
                        keyboard: 'meta+shift+2'
                    },
                    link: {
                        el: 'a',
                        className: 'link',
                        command: 'createLink',
                        type: 'inline',
                        title: t('Link', 'meta+k'),
                        keyboard: 'meta+k'
                    },
                    strikethrough: {
                        el: 'strike',
                        className: 'strikethrough',
                        command: 'strikethrough',
                        type: 'inline',
                        title: t('Strikethrough', 'meta+shift+6'),
                        keyboard: 'meta+shift+6'
                    },
                    orderedList: {
                        el: 'ol',
                        className: 'ordered-list',
                        command: 'insertOrderedList',
                        type: 'list',
                        title: t('Ordered List', 'meta+shift+7'),
                        keyboard: 'meta+shift+7'
                    },
                    unorderedList: {
                        el: 'ul',
                        className: 'unordered-list',
                        command: 'insertUnorderedList',
                        type: 'list',
                        title: t('Unordered List', 'meta+shift+8'),
                        keyboard: 'meta+shift+8'
                    },
                    blockquote: {
                        el: 'blockquote',
                        className: 'quote',
                        command: 'formatBlock',
                        type: 'block',
                        title: t('Blockquote', 'meta+shift+9'),
                        keyboard: 'meta+shift+9'
                    },
                    clear: {
                        el: '',
                        command: 'removeFormat',
                        type: 'inline',
                        keyboard: 'meta+shift+0'
                    },
                    pre: {
                        el: 'pre',
                        command: 'formatBlock',
                        type: 'block',
                        keyboard: 'meta+alt+1'
                    },
                    superscript: {
                        el: 'sup',
                        command: 'superscript',
                        type: 'inline',
                        keyboard: 'meta+dot'
                    },
                    subscript: {
                        el: 'sub',
                        command: 'subscript',
                        type: 'inline',
                        keyboard: 'meta+comma'
                    },
                    small: {
                        el: 'small',
                        command: 'insertHTML',
                        type: 'inline',
                        keyboard: 'meta+shift+minus',
                        keyboardInverse: 'meta+shift+plus'
                    }
                },
                controlsOrder: ['bold', 'italic', 'headline', 'link', 'strikethrough', 'orderedList', 'unorderedList', 'blockquote'],
                onShow: function(controls) {
                    if (_.isFunction(this.animateShowControls)) {
                        this.animateShowControls.call(this, controls);
                    } else {
                        controls.element.show();
                    }
                },
                onHide: function(controls) {
                    if (_.isFunction(this.animateHideControls)) {
                        this.animateHideControls.call(this, controls);
                    } else {
                        controls.element.hide();
                    }
                },
                onAction: function(controls) {
                    var parentNodes = SelectionContext.getNodeList();
                    controls.setActives(parentNodes);
                }
            },
            showStaticControls: true
        };

        _.merge(this.config, config || {});

        this.applyCommand = _.bind(applyCommand, this);
        this.inverseCommand = _.bind(inverseCommand, this);

        this.animateShowControls = _.bind(this.config.animateShowControls, this);
        this.animateHideControls = _.bind(this.config.animateHideControls, this);

        this.onChange = function(type) {
            var data = getRawData.call(this);
            if (this.previousRawData !== data) {
                runPlaceholder.call(this);
                this.config.onChange.call(this);
                this.previousRawData = data;
            }
        };

        var linkConfig = bindConfigCallbacks(this.config.linkConfig, this);
        this.linkControl = new LinkControl(linkConfig);

        var inlineControlsConfig = bindConfigCallbacks(this.config.inlineControlsConfig, this);
        this.inlineControls = new InlineControls(inlineControlsConfig);

        var contextualControlsConfig = bindConfigCallbacks(_.defaults({
            keyboardEvents: this.keyComboEvents
        }, this.config.formattingControlsConfig), this);

        this.contextualControls = new FormattingControls(this.applyCommand, this.inverseCommand, contextualControlsConfig);

        var baseOnShow = this.config.formattingControlsConfig.onShow;
        var baseOnHide = this.config.formattingControlsConfig.onHide;
        var staticControlsConfig = bindConfigCallbacks(_.defaults({
            onShow: function(controls) {
                baseOnShow.apply(this, arguments);
                controls.listener = controls.listener || function(e) {
                    var parentNodes = SelectionContext.getNodeList();
                    controls.setActives(parentNodes);
                    document.removeEventListener('mousedown', controls.listener, false);
                };
                document.addEventListener('mousedown', controls.listener);
            },
            onHide: function(controls) {
                baseOnHide.apply(this, arguments);
                document.removeEventListener('mousedown', controls.listener, false);
            }
        }, this.config.formattingControlsConfig), this);
        this.staticControls = new FormattingControls(this.applyCommand, this.inverseCommand, staticControlsConfig);

        this.dataFilter = new DataFilter(this.config.filterRules);

        this.keyModifiers = {
            shift: false,
            meta: false,
        };

        this.undoManager = new UndoManager(this, _.bind(function() {

            // For all the aysnc media, go through each one
            for (var key in this.mediaTracker) {
                // If we have a new source, set that on the image
                var trackerSource = this.mediaTracker[key].updatedSource;
                if (trackerSource) {
                    var img = getAsyncImage.call(this, key);
                    $(img).attr('src', trackerSource);
                }
            }
            updateInlineToolbar.call(this);
        },this));

        if (this.config.smartQuotes.enabled) {
            this.smartQuoter = new SmartQuoter(this, this.config.smartQuotes.config);
        }

        /**
         * A collection of unique keys mapped to media meta data objects.
         *
         * Properties:
         *
         * - originalSource
         * - updatedSource
         */
        this.mediaTracker = { };

        setupUI.call(this);
    };

    /**
     * ### bindConfigCallbacks
     *
     * Functions in the config Object with keys matching the `onEventName`
     * naming convention are bound to the editor instance
     */
    function bindConfigCallbacks(config, thisArg) {
        return _.mapValues(config, function(value, key) {
            if (key.match(/^on[A-Z]/) && _.isFunction(value)) {
                return _.bind(value, this);
            } else {
                return value;
            }
        }, thisArg);
    }

    /**
     * ### setupUI
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
        slot = $(this.element).parent();
        this.wrapper = slot.parent().get(0);

        // Add placeholder element
        this.placeholderElement = $('<div />', {
            'data-js': 'editor-placeholder',
            'class': 'editor-placeholder',
        }).css('position', 'absolute');

        // Fix for IE. editor-placeholder should have pointer-events disabled.
        this.placeholderElement.on('click', _.bind(function(e) {
            this.focus();
        }, this));

        // Setup the contextual controls
        slot.append(this.contextualControls.element);
        slot.append(this.linkControl.element);
        slot.append(this.placeholderElement);
        slot.append(this.inlineControls.element);

        runPlaceholder.call(this);

        // Setup control bar
        this.controlBar = $('<div />', { 'data-js': 'control-bar', 'class' : 'control-bar disabled'});

        var staticControlButton = $('<div />', { 'class': 'static-controls control' });

        this.controlBar.append(staticControlButton);
        this.controlBar.append(this.staticControls.element);

        var editor = this;

        staticControlButton.on('mousedown',function(e) {
            e.preventDefault();
            e.stopPropagation();

            var parentNodes = SelectionContext.getNodeList();
            editor.staticControls.setActives(_.pluck(parentNodes, 'nodeName'));

            var position = $(this).position();

            if (editor.staticControls.isShown) {
                editor.staticControls.hide();
            } else {
                editor.staticControls.open(position.left + $(this).width()/2, 0);
            }

            editor.contextualControls.hide();
            editor.linkControl.close();

            return false;
        });

        if (this.config.showStaticControls) {
            $(this.wrapper).append(this.controlBar);
        }

        initInterfaceEvents.call(this);
        setupDragAndDrop.call(this);
    }

    /**
     * ### initInterfaceEvents
     *
     * Sets up the user interaction events and delegates to editor methods.
     */
    function initInterfaceEvents() {

        var editor = this;

        var hasControlsOpen = function() {

            var somethingOpen = editor.inlineControls.isTrayOpen ||
                editor.contextualControls.isShown ||
                editor.staticControls.isShown ||
                editor.linkControl.isShown;

            return somethingOpen;
        };

        // All interface events trigger our onClientEvent function
        $(this.element).on('input keydown keyup keypress mousedown mouseup', function(e) {
            editor.controlBar.removeClass('disabled');
            editor.config.onClientEvent.call(editor, e);
        });

        // Keyboard content change wrapper (called from within key handlers)
        var updateContentAndInterface = function() {
            runInterfaceUpdate.call(this);
            this.onChange();
        };

        /*
         * #### Keyboard Events
         */

        // Bind key down event to our internal key commands
        $(this.element).on('keydown', function(e) {
            if (e.keyCode === KEY_CODES.shift) {
                editor.keyModifiers.shift = true;
            } else if (_.contains([KEY_CODES.metaLeft, KEY_CODES.metaRight], e.keyCode)) {
                editor.keyModifiers.meta = true;
            } else if (e.keyCode === KEY_CODES.esc) {
                if (hasControlsOpen()) {
                    editor.contextualControls.hide();
                    editor.staticControls.hide();
                    if (editor.inlineControls.isTrayOpen) {
                        editor.inlineControls.toggleTrayWithIntent(false);
                    }
                    e.stopPropagation();
                }
                return;
            } else if (e.keyCode === KEY_CODES.backspace) {
                overrideMediaBoundaryBackspace.call(editor, e);
                enforceBlockContext.call(editor);
            } else if (e.keyCode === KEY_CODES.enter) {
                overrideBlockquoteEnter.call(editor, e);
                overridePreformattedBlockEnter.call(editor, e);
                // TODO: Consider enabling this for custom line breaks on SHIFT+ENTER (Safari)
                // Currently, this causes an **EXTRA LINE** in Firefox when enabled.
                if (Utils.browser.safari && e.shiftKey) {
                    e.preventDefault();
                    insertNewline.call(editor);
                }
            }

            var isValidKeyCodes = _.contains(_.values(_.omit(KEY_CODES, 'enter')), e.keyCode);
            if (isCharacterLimitExceeded.call(editor) && !isValidKeyCodes && !editor.keyModifiers.meta) {
                editor.keyModifiers.meta = false;
                e.preventDefault();
            }

            runKeyCommand.call(editor, e);
            runInterfaceUpdate.call(editor,e);

        });

        // Bind key up for anything in the editor element
        $(this.element).on('keyup', function(e) {
            if (e.keyCode === KEY_CODES.shift) {
                editor.keyModifiers.shift = false;
            } else if (_.contains([KEY_CODES.metaLeft, KEY_CODES.metaRight], e.keyCode)) {
                editor.keyModifiers.meta = false;
            } else if (e.keyCode === KEY_CODES.enter) {
                // Make sure we have proper blocks
                enforceBlockContext.call(editor);
            } else if (e.keyCode === KEY_CODES.backspace || e.keyCode === KEY_CODES['delete']) {
                // On backspace, run the clean up to prevent crazy attributes
                cleanupNodesInContext.call(editor);

                _.defer(function() {
                    cleanupEmpties.call(editor);
                });
            }

            var inlineControlsOverride = false;
            // check for right arrow key with no shift press
            if (e.keyCode === KEY_CODES.right && !e.shiftKey && editor.inlineControls) {
                inlineControlsOverride = editor.inlineControls.isShown;
            }

            // ignore esc and right arrow key when shift is not pressed
            if (e.keyCode !== KEY_CODES.esc && !inlineControlsOverride) {
                // ignore esc and right arrow key when shift is not pressed
                updateContentAndInterface.call(editor);
            }
        });

        /**
         * Other events that could potentially trigger content changes.
         * "input" for non-keyboard content changes in modern browsers (emoji menu, spellcheck, etc.)
         * "blur" as a fallback for "input" in IE and older versions of FF
         */
        $(this.element).on('input', function() {
            updateContentAndInterface.call(editor);
        });

        /**
         * #### Mouse Events
         *
         * *Includes both this element and the document itself*
         */

        // Store a variable that tracks "intention",
        // which means the mouse was pressed down inside the editor.
        var hasMouseIntention = false;

        $(this.element).on('mouseup', function() {
            hasMouseIntention = false;
            runInterfaceUpdate.call(editor);
        });

        $(this.element).on('mousedown', function(e) {
            hasMouseIntention = true;
        });

        // Close EVERYTHING when clicking outside the wrapper
        document.addEventListener('mousedown', function(e) {
            var defaultOnMousedown = function() {
                hasMouseIntention = false;
                closeControls.call(editor);
                editor.controlBar.addClass('disabled');
            };

            if (editor.wrapper !== e.target && !$.contains(editor.wrapper, e.target)) {
                if (!editor.config.documentMousedownHook(e, defaultOnMousedown)) {
                    defaultOnMousedown();
                }
            }

        }, true);

        // When mousing anywhere, if we have an intention, run the selection
        document.addEventListener('mouseup', function(e) {
            if (hasMouseIntention) {
               runInterfaceUpdate.call(editor);
               hasMouseIntention = false;
            }
        }, true);

        /*
         * Special Events (focus, paste, etc)
         */
        $(this.element).on('focus', function() {
            editor.controlBar.removeClass('disabled');

            /**
             * Firefox doesn't set the cursor inside the first element
             * when focusing with the TAB key. To fix this, and prevent typing outside
             * the child text nodes, check for a root block and explicity set the cursor
             * if we don't have it.
             */
            if (!getRootBlock.call(editor)) {
                var allBlocks = $(editor.element).children(BLOCK_ELEMENTS.join());
                if (allBlocks.length) {
                    var firstBlock = allBlocks.first().get(0);
                    SelectionPersistence.setToStart(firstBlock);
                }
            }

            _.defer(function() { editor.onChange(); });
        });

        $(this.element).on('blur', function(e) {

            var defaultOnBlur = function(afterInterfaceUpdate) {
                // Short circuit if any controls are open
                if (hasControlsOpen()) {
                    return;
                }

                // When blurring, we want to remove the selection so we can clean up properly.
                var selection = SelectionContext.getSelection();
                if (selection && SelectionContext.isInContext(selection, editor.element)) {
                    selection.removeAllRanges();
                }

                runInterfaceUpdate.call(editor, function() {
                    editor.onChange();
                    if (_.isFunction(afterInterfaceUpdate)) {
                        afterInterfaceUpdate();
                    }
                });
            };

            if (!editor.config.blurHook(e, defaultOnBlur)) {
                _.defer(defaultOnBlur);
            }
        });

        $(this.element).on('paste', function(e) {

            var clipboardData = (e.originalEvent || e).clipboardData;

            if (!clipboardData) {
                return; // If no clipboard data, just give up now to avoid errors.
            }

            if (!editor.config.pasteHook(clipboardData, editor.keyModifiers.shift)) {
                insertClientData.call(editor, clipboardData);
            }
            //TODO: Consider running our generic interface update here instead of doing
            // all this explicitly
            updateInlineToolbar.call(editor);
            e.preventDefault();
        });

        $(this.element).on('cut', function(e) {
            //TODO: Consider running our generic interface update here instead of doing
            // all this explicitly
            editor.contextualControls.hide();
            editor.staticControls.hide();
            editor.linkControl.close();
            _.defer(function() {
                cleanupEmpties.call(editor);
                updateInlineToolbar.call(editor);
                editor.onChange();
            });
        });
    }

    /**
     * ### isCharacterLimitExceeded
     *
     * @return {Boolean}
     */
    function isCharacterLimitExceeded() {
        if (this.config.characterLimit) {
            return this.element.innerText.length > this.config.characterLimit;
        }

        return false;
    }

    /**
     * Creates a new line at the cursor position (using either `<br>` or `\n`) depending on
     * which element we're in.
     */
    function insertNewline() {
        var rootBlock = getRootBlock.call(this);
        var linebreakText =  _.contains(PRE_FORMATTED_ELEMENTS, rootBlock.nodeName) ? '\n' : '<br>';

        // If at the end of the block, add an extra line break for an "empty" new line
        var additional = SelectionContext.isCursorAtEnd(rootBlock) && !SelectionContext.isCursorAtStart(rootBlock) ? 1 : 0;
        for(var i = 0; i < additional; i++) {
            linebreakText += linebreakText;
        }
        insertDataAtCursor.call(this, linebreakText);
    }

    /**
     * ### overridePreformattedBlockEnter
     *
     * Custom behavior when pressing enter inside of preformatted blocks where newlines are king instead of <br>'s.
     *
     * @param {Event} e The key event that triggered this. Used for preventDefault.
     */
    function overridePreformattedBlockEnter(e) {
        var text, element = SelectionContext.getNodeByNames(PRE_FORMATTED_ELEMENTS), $element;

        if (! element || this.keyModifiers.shift || ! SelectionContext.isCursorAtEnd(element)) {
            return;
        }

        $element = $(element);
        text = $element.text();

        e.preventDefault();

        // Two newlines? Get out of here!
        if (text.match(/\n\n$/)) {
            _.last($element.contents()).remove();
            this.insertNewParagraphAfter(element);
        } else {
            $element.append('\n\n');
            SelectionPersistence.setToEnd(element);
        }
    }

    /**
     * ### overrideBlockquoteEnter
     *
     * Custom behavior when pressing enter inside of blockquotes. Allows us to break out
     * of blockquotes when there is an empty last paragraph.
     *
     * @param {Event} e The key event that triggered this. Used for preventDefault.
     */
    function overrideBlockquoteEnter(e) {

        var bq = SelectionContext.getNodeByNames(['BLOCKQUOTE']);

        if (!bq || this.keyModifiers.shift || !SelectionContext.isCursorAtEnd(bq, true)) {
            return;
        }

        // If there's no last paragraph (rare/unexpected),
        // OR there's no previous sibling,
        // OR the last paragraph isn't empty
        // Then we're done here.
        var lastP = bq.lastElementChild.nodeName === 'P' ? bq.lastChild : null;

        if(!lastP || !lastP.previousSibling || !this.dataFilter.isEmptyElement(lastP,true)) {
            return;
        }

        // We've pressed ENTER in the LAST empty paragraph, remove it and break out of blockquote
        e.preventDefault();
        $(lastP).remove();
        this.insertNewParagraphAfter(bq);
    }

    /**
     * ### closeControls
     *
     * Helper to close all the "controls" in the editor. This might not include all the
     * interface elements .. but it probably should.
     */
    function closeControls() {
        this.contextualControls.hide();
        this.staticControls.hide();
        this.linkControl.close();
        this.inlineControls.close();
    }

    /**
     * ### cleanupEmpties
     *
     * Go through all the editor contents and clear out the entire editor if
     * we can't find any media or blocks with text.
     *
     * We need this because `ctrl-a, delete` just doesn't cut it.
     */
    function cleanupEmpties() {

        // Check for media blocks (early return)
        if ($(this.element).has(MEDIA_ELEMENTS.join()).length) {
            return;
        }

        // Clean up bastard lists
        var emptyLists = $(this.element).find('ul:not(:has(li)),ol:not(:has(li))');
        emptyLists.remove();

        // Go through each text block and GTFO of here if it has text
        var hasTextInBlock = _.some($(this.element).children().toArray(), function(block) {
            return block.textContent.length > 0;
        });

        if (hasTextInBlock) {
            return;
        }

        // If we're here, then all hope is lost, there's nothing of interest
        // in the editor. Blow it alll away!
        setRawData.call(this, '');

        // Run enforceBlockContext to make sure we have SOMETHING to start with
        enforceBlockContext.call(this);

        // Run placeholder ;)
        runPlaceholder.call(this);
    }

    /**
     * ### overrideMediaBoundaryBackspace
     *
     * When backspacing, if the cursor is at the begining of a block and the previous block
     * is media, remove the media and prevent the default browser backspace behavior.
     *
     * @param {Event} e The key event for the backspace.
     */
    function overrideMediaBoundaryBackspace(e) {

        // Inexpensive check to bail out early first for non-cursors
        var selection = SelectionContext.getSelection();
        if (!selection.isCollapsed) {
            return;
        }

        // More expensive lookup for the position within this root block
        var rootBlock = getRootBlock.call(this);
        if (!rootBlock || SelectionPersistence.saveSelection(rootBlock).start > 0) {
            return;
        }

        var prevBlock = $(rootBlock).prev().get(0);

        if (prevBlock && isMediaHolder.call(this, prevBlock)) {
            $(prevBlock).remove();
            e.preventDefault();
        }
    }

    /**
     * ### setupDragAndDrop
     *
     * Used to bind rag and drop across the editor element.
     *
     * This is sort of a exhaustive approach, but works well enough as a first try.
     * **Note**: _Calling this on every change really causes a performance hit. Will need to find a better way._
     */
    function setupDragAndDrop() {
        var editor = this;

        var editorOffsetTop = $(editor.element).offset().top;
        var nearestOverInfo = null;

        var dragevents = 'dragstart dragenter dragleave dragover dragend drop';
        var dragType = false;

        var isFileDrag = function(e){
            var hasFilesType = e.dataTransfer.types && _.some(e.dataTransfer.types, function(type) {
                return type === 'Files';
            });
            return hasFilesType;
        };

        var isMediaDrag = function(e) {
            return $(e.target || e.srcElement).attr('contenteditable') === 'false';
        };

        var addImageFiles = function(files, targetNode, insertDirection) {

            if (!files.length) {
                return;
            }

            // Save initial state
            editor.onChange();

            _.each(files, function(file) {
                editor.config.onFileAdded.call(editor, file, targetNode, insertDirection);
            });

            runInterfaceUpdate.call(editor);
        };

        var isAboveTopSection = function(pos, boxInfo) {
            return pos < (boxInfo.top + boxInfo.height * 0.66);
        };

        // Calculate some fun info for our element
        var getBoxInfo = function(pos, el) {
            var boxOffsetTop = $(el).offset().top - editorOffsetTop;
            var boxHeight = $(el).get(0).getBoundingClientRect().height;
            var isOverBottom = pos > boxOffsetTop + (boxHeight * 0.66);
            return {
                element: el,
                top: boxOffsetTop,
                bottom: boxOffsetTop + boxHeight,
                height: boxHeight,
                isAfter: isOverBottom
            };
        };

        // Remove over classes and remove entire class if empty
        var cleanupOverClasses = function() {
            $(editor.element).find('.over-top, .over-bottom').each(function() {
                $(this).removeClass('over-top').removeClass('over-bottom');
                if ($(this).attr('class').trim() === '') {
                    $(this).removeAttr('class');
                }
            });
        };

        // Find the block and position for a drag event.
        var setNearestBlockInfo = function(e) {

            var overInfo = null;
            var dragY = e.pageY - editorOffsetTop;
            var blocks = $(editor.element).children();

            // If we haven't moved to a different block, don't bother with all the calculations.
            if (nearestOverInfo && (dragY > nearestOverInfo.top) && isAboveTopSection(dragY,nearestOverInfo)) {
                return;
            }

            // Go through all the elements and find the first one that is over or before.
            blocks.each(function() {
                var boxInfo = getBoxInfo(dragY,this);
                if (isAboveTopSection(dragY, boxInfo) && (e.target || e.srcElement) !== this) {
                    overInfo = boxInfo;
                    return false;
                }
            });

            // If we didn't find anything yet, lets just use the last block!
            if (!overInfo) {
                overInfo = getBoxInfo(dragY,blocks.last().get(0));
                overInfo.isAfter = true;
            }

            // Update nearest info if a new element or position
            if (!overInfo || !nearestOverInfo || nearestOverInfo.element !== overInfo.element || nearestOverInfo.isAfter !== overInfo.isAfter) {
                cleanupOverClasses();
                nearestOverInfo = overInfo;
            }
        };

        $(editor.element).unbind(dragevents);

        $(editor.element).on('dragleave', function(e) {
            cleanupOverClasses();
        });
        $(editor.element).on('dragover', function(e) {

            if (!dragType) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            _.debounce(setNearestBlockInfo, 100)(e.originalEvent);

            if (nearestOverInfo) {
                $(nearestOverInfo.element).addClass(nearestOverInfo.isAfter ? 'over-bottom' : 'over-top');
                if (isFileDrag(e.originalEvent)) {
                    e.stopPropagation();
                }
            }
            e.preventDefault();
        });

        $(editor.element).on('dragenter', function(e) {
            e.preventDefault();
            if (isFileDrag(e.originalEvent)) {
                dragType = 'file';
            }
        });

        $(editor.element).on('dragstart', function(e) {

            closeControls.call(editor);

            if (isMediaDrag(e.originalEvent)) {
                dragType = 'media';
                var el = e.originalEvent.target || e.originalEvent.srcElement;

                var dataTransfer = e.originalEvent.dataTransfer;
                if (dataTransfer) {
                    dataTransfer.effectAllowed = 'move';
                    dataTransfer.dropEffect = 'move';
                    try {
                        var imgUrl = $(el).find('img').attr('src') || '';
                        if (imgUrl.match(/^\s*data:/)) {
                            // Large data URLs tend to crash Chrome
                            imgUrl = '';
                        }
                        dataTransfer.setData('text/uri-list', imgUrl);
                        dataTransfer.setData('text/plain', imgUrl);
                    } catch (e) {}
                }

                // Why defer? We want to set overflow hidden and animate _after_ the browser
                // generates a preview image for the drag.
                _.defer(function() {
                    $(el).addClass('dragging');
                });
            }
        });

        // Dropping works for files - dragging and dropping from the computer
        $(editor.element).on('drop', function(e) {

            cleanupOverClasses();

            if (isFileDrag(e.originalEvent)) {
                addImageFiles(e.originalEvent.dataTransfer.files, nearestOverInfo.element, nearestOverInfo.isAfter ? 1 : -1);
            }

            // Cancel browser default handling of drop (includes ignoring text)
            e.stopPropagation();
            e.preventDefault();
        });

        // Dragend is used to handle dragging media elements
        $(editor.element).on('dragend', function(e) {

            if (isMediaDrag(e.originalEvent)) {

                cleanupOverClasses();

                var el = e.originalEvent.target || e.originalEvent.srcElement;
                var height = $(el).data('origHeight');
                var elToShow = el;

                // If dropping on a nearest over block, (and not the block we're moving)
                if (nearestOverInfo && elToShow !== nearestOverInfo.element) {

                    var elToshow = $(el).remove();

                    if (nearestOverInfo.isAfter) {
                        $(nearestOverInfo.element).after(elToshow);
                    } else {
                        $(nearestOverInfo.element).before(elToshow);
                    }
                    rebindMediaHolderEvents.call(editor, elToshow);
                }

                $(elToShow).animate({height: height }, 200, function() {
                    $(elToShow).removeClass('dragging');
                });

                editor.onChange();
                runInterfaceUpdate.call(editor);
            }
            dragType = false;
        });
    }

    /**
     * ### proxyCommand
     *
     * This is nuts, but saves us from implementing support for custom tags.
     * We piggybacking on a style that is not used across the editor (for instance underline),
     * and let the browser deal with concats and splits
     *
     * @param {String} command The command to be processed by the editor
     * @param {Element} proxyElement The element that the command creates (that will later be replaced)
     * @param {Element} replaceProxyElementWith The element that we want to replace the proxyElement with
    */
    function proxyCommand(command, proxyElement, replaceProxyElementWith) {
        var $root = $(this.element);
        var savedSel = SelectionPersistence.saveSelection(this.element);

        // We do this in two passes because we don't want to wrap the text contents
        $root.find(replaceProxyElementWith).wrap('<' + proxyElement + '>');
        $root.find(replaceProxyElementWith).contents().unwrap();

        SelectionPersistence.restoreSelection(savedSel);

        window.document.execCommand(command);

        $root.find(proxyElement).wrap('<' + replaceProxyElementWith + '>');
        $root.find(proxyElement).contents().unwrap();

        SelectionPersistence.restoreSelection(savedSel);
    }

    /**
     * ### applyCommand
     *
     * Takes a command string, and optional element name then does.. many things.
     * This is really a router for commands, it shouldn't be doing much besides filtering,
     * applying basic rules and passing flow on to somewhere else.
     *
     * @param {String} command The command to be processed by the editor
     * @param {String} elementName (optional) Some commands are special and need an element. This is that name.
     * @param {Element} [fromControl] The control that iniated this command, if applicable.
    */
    function applyCommand(command, elementName, fromControl) {

        var editor = this;

        // Run the list, and flatten the blocks to enforce a list block
        var doList = function() {
            window.document.execCommand(command);
            if (editor.config.flattenBlocks) {
                flattenBlocksInContext.call(editor);
            }
        };

        var doLink = function() {
            var savedSelection = SelectionPersistence.saveSelection(editor.element);
            // This should be more robust at some point...
            var linkDefaultWidth = 200;
            var linkAnimationTime = 240;

            if (fromControl && ! fromControl.isAnimating && ! savedSelection.selection.isCollapsed) {

                setTimeout(function() {

                    //TODO: This focus doesn't seem to work if it's not "visible"?
                    $(editor.linkControl.linkEditInput).focus();

                    var onComplete = function(x,y) {
                        var linkX = x - $(editor.wrapper).offset().left;
                        var linkY = y - $(editor.wrapper).offset().top;

                        editor.linkControl.size(linkDefaultWidth);
                        editor.linkControl.show(linkX, linkY);
                        editor.linkControl.createLink(savedSelection);
                    };

                    // TODO: This is a little sketchy...
                    fromControl.closeWithShim(
                        fromControl.element.find('.link').get(0),
                        linkDefaultWidth,
                        linkAnimationTime,
                        onComplete
                    );

                    savedSelection.selection.removeAllRanges();
                    editor.blur(true);

                }, 30); // Make this longer than the runInterfaceUpdate hack
            }
        };

        // Formatting a block is not as simple as applying formatting a block..
        // We want to make sure what ever block we're formatting to is the **root level block**.
        var doBlock = function(type) {

            var savedSelection = SelectionPersistence.saveSelection(editor.element);

            var rootNodes = SelectionContext.getRootElements();

            // Inverse the all the possible "formatted" blocks
            _.each(FORMATTED_BLOCKS, function(blockType) {
                var formattedBlocks = SelectionContext.getNodesByNames(rootNodes, [blockType]);
                if(formattedBlocks.length) {
                    inverseCommand.call(editor, 'formatBlock', blockType);
                }
            });

            // Outdent indented blocks (lists)
            undoIndentedBlock.call(editor);

            // Format for new block type
            switch(type.toLowerCase()) {
                case 'blockquote':
                    // Format to paragraphs (removes headings etc)
                    // Wrap all our root elements in a blockquote
                    rootNodes = SelectionContext.getRootElements();

                    var textBlockStacks = [];
                    var currStack = [];

                    // Create "sets" of text blocks to wrap
                    // (We want to exlude media from being inside the blockquote
                    rootNodes = _.each(rootNodes, function(node) {
                        if(_.contains(TEXT_BLOCKS, node.nodeName.toUpperCase())) {
                            currStack.push(node);
                        } else {
                            textBlockStacks.push(currStack);
                            currStack = [];
                        }
                    });

                    if(currStack.length) {
                        textBlockStacks.push(currStack);
                    }

                    _.each(textBlockStacks, function(stack) {
                        $(stack).wrapAll(document.createElement(type));
                    });

                    break;
                case 'pre':
                    window.document.execCommand('formatBlock', false, '<' + type + '>');
                    convertPreNewlinesInContext.call(this); // PRE's don't need <br>'s, so...
                    break;
                default:
                    window.document.execCommand('formatBlock', false, '<' + type + '>');
                    break;
            }

            SelectionPersistence.restoreSelection(savedSelection);
        };

        var doRemoveFormat = function() {
            // Sorry for reaching into contextualControls
            // The active states should ideally be contained in richTextEditor.
            // @TODO: Will refactor.
            var controls = editor.contextualControls.controls;
            var activeStates = editor.contextualControls.getActiveStates();
            _.each(activeStates, function (active, commandName) {
                var config = controls[commandName];
                if (active) {
                    inverseCommand.call(editor, config.command, config.el);
                }
            });
            window.document.execCommand('removeFormat');
        };

        switch(command) {
            case 'formatBlock':
                doBlock(elementName);
                break;
            case 'createLink':
                doLink();
                break;
            case 'insertOrderedList':
                doList();
                break;
            case 'insertUnorderedList':
                doList();
                break;
            case 'removeFormat':
                doRemoveFormat();
                break;
            case 'insertHTML':
                proxyCommand.call(this, 'underline', 'U', elementName);
                break;
            default:
                // Simple inline formatters
                window.document.execCommand(command);
        }

        runInterfaceUpdate.call(this);
        cleanupNodesInContext.call(this);
        editor.onChange();
    }

    /**
     * ### inverseCommand
     *
     * Applies the "inverse" of a command.
     *
     * @param {String} command The command to execute
     * @param {String} [elementName] An optional element name to apply when executing
     */
    function inverseCommand(command, elementName) {

        var editor = this;

        switch(command) {
            case 'formatBlock':
                var savedSel = SelectionPersistence.saveSelection(this.element);

                undoIndentedBlock.call(editor);

                // Apply to all the rootNodes in our context
                _.each(SelectionContext.getRootElements(), function(rootNode) {
                    // When undoing formatting of blocks, we want to flatten them down
                    // This is how we "unformat" blockquotes that have paragraphs inside them
                    editor.dataFilter.unBlock(rootNode);

                    // Convert PRE linebreaks to HTML linebreaks
                    if(rootNode.nodeName.toLowerCase() === 'pre') {
                        rootNode.innerHTML = rootNode.innerHTML.replace('\n','<br>');
                    }

                    // Convert the root block to a paragraph
                    // Using window.document.execCommand('formatBlock', false, '<p>');
                    // seems tempting, but it does weird things with linebreaks.
                    var nodeName = rootNode.nodeName.toUpperCase();
                    if(_.contains(FORMATTED_BLOCKS, nodeName)) {
                        var inner = $(rootNode).contents();
                        $(inner).wrapAll('<p>');
                        $(rootNode.firstChild).unwrap();
                    }
                });

                SelectionPersistence.restoreSelection(savedSel);
                break;
            case 'insertOrderedList':
                undoIndentedBlock.call(this);
                break;
            case 'insertUnorderedList':
                undoIndentedBlock.call(this);
                break;
            case 'createLink':
                window.document.execCommand('unlink');
                break;
            case 'insertHTML':
                proxyCommand.call(this, 'underline', 'U', elementName);
                break;
            default:
                // Simple inline formatters
                window.document.execCommand(command);
                break;
        }

        cleanupNodesInContext.call(this);
        runInterfaceUpdate.call(this);
        this.onChange();
    }

    /**
     * ### runKeyCommand
     *
     * Checks for special keys and key combinations to run commands in the editor.
     * @param {Event} e The keydown event
     */
    function runKeyCommand(e) {

        // Handle TAB key indent / outdents
        var isListCheck = function() {
            var listNodes = SelectionContext.getNodeByNames(['UL','OL']);
            return !!listNodes;
        };

        if (e.keyCode === KEY_CODES.tab && isListCheck()) {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                applyCommand.call(this, 'outdent');
                if (!isListCheck()) {
                    applyCommand.call(this,'formatBlock','p');
                }
            } else {
                applyCommand.call(this, 'indent');
            }
        }
    }

    /**
     * ### convertPreNewlinesInContext
     *
     * Contenteditable converts \n to <br> when switching between pre- and non-preformatted blocks.
     * However, it doesn't deal with the inverse case (converting <br> to \n when going from e.g. ul/ol/blockquote to pre).
     * So we have to do it ourselves.
     */
    function convertPreNewlinesInContext() {
        var parentBlock = SelectionContext.getNodeByNames(PRE_FORMATTED_ELEMENTS);
        if (parentBlock) {
            $(parentBlock).find('br').replaceWith('\n');
        }
    }

    /**
     * ### undoIndentedBlock
     *
     * - *Outdent while there are still blocks of this name in parents.*
     * - Format as a P afterwards
     *
     * @param {string[]} nodeNames The names of the nodes to outdent.
     */
    function undoIndentedBlock() {

        var indentedNode = SelectionContext.getNodeByNames(INDENTED_ELEMENTS);

        if(!indentedNode) {
            return;
        }

        do {
            window.document.execCommand('outdent');
        }
        while (SelectionContext.getNodeByNames(INDENTED_ELEMENTS));

        if (!SelectionContext.getNodeByNames(['H2'])) {
            window.document.execCommand('formatBlock', false, '<p>');
        }

        // Lets make sure we didn't screw everything up...
        this.dataFilter.blockifyInlineNodes(this.element);
    }

    /**
     * ### flattenBlocksInContext
     *
     * Goes through the parent nodes and removes any blocks.
     * We need to _save_ and _restore_ the selection since we're manually screwing with the DOM.
     */
    function flattenBlocksInContext() {
        var savedSel = SelectionPersistence.saveSelection(this.element);
        var nodeList = SelectionContext.getNodeList(null, true);
        this.dataFilter.unwrapParentBlocks(nodeList);
        SelectionPersistence.restoreSelection(savedSel);
    }

    /**
     * ### cleanupNodesInContext
     *
     * Goes through parent nodes and:
     *
     * - Strips spans
     * - Removes style attributes
     */
    function cleanupNodesInContext() {

        // Scrubbing spans might screw with the selection, so lets save/restore it ourselves.
        var savedSel = SelectionPersistence.saveSelection(this.element);
        var nodeList = SelectionContext.getNodeList();
        var didRemoveSpans = this.dataFilter.scrubSpansAndBadAttrs(nodeList);

        // Only restore if we removed spans, and it's a selection, not a cursor
        if (didRemoveSpans && savedSel.end > savedSel.start) {
            SelectionPersistence.restoreSelection(savedSel);
        }
    }

    /**
     * ### runInterfaceUpdate
     *
     * Updates our interface elements for controls, media boundaries, and placeholding.
     */
    function runInterfaceUpdate(afterUpdate) {
        var editor = this;

        setTimeout(function() {

            var selection = SelectionContext.getSelection();

            if (!selection) {
                updateMediaBoundaries.call(editor);
                if(_.isFunction(afterUpdate)) {
                    afterUpdate();
                }
                return;
            }

            if (selection.isCollapsed) {
                onCursor.call(editor,selection);
            }
            else {
                onSelection.call(editor,selection);
            }

            updateMediaBoundaries.call(editor);
            enforceEndingTextBlock.call(editor);

            editor.config.onSelection.call(editor, selection);

            if (SelectionContext.isInContext(selection, editor.element)) {
                editor.lastSelection = SelectionPersistence.saveSelection(editor.element);
            }

            updateInlineToolbar.call(editor);
            runPlaceholder.call(editor);

            if(_.isFunction(afterUpdate)) {
                afterUpdate();
            }

        }, 20);

        // Browsers are weird. Selections that are collapsed were being reported is not collpased.
        // Example: Clicking inside a current selection, it should be a "cursor".
        // The delay above seems to fix that?
    }


    /**
     * ### onSelection
     *
     * Updates some controls based on a range selection. (Not cursor)
     *
     * @param {Selection} selection The active selection to use.
     */
    function onSelection(selection) {

        if (!SelectionContext.isInContext(selection, this.element)) {
            return;
        }

        var coords = SelectionContext.getContextCoordinates($(this.element).parent().parent());
        var parentNodes = SelectionContext.getNodeList(selection);

        this.contextualControls.setActives(_.pluck(parentNodes, 'nodeName'));
        this.staticControls.setActives(_.pluck(parentNodes, 'nodeName'));

        // Any selection causes link control to close
        this.linkControl.close();
        this.inlineControls.close();

        if (selection.toString().trim() !== '' && coords && !this.staticControls.isShown) {
            this.contextualControls.open(coords.x,coords.y);
        }
    }

    /**
     * ### onCursor
     *
     * Updates the controls based on where the cursor is.
     *
     * @param {Selection} selection The active selection to use.
     */
    function onCursor(selection) {

        // Hide the controls if it's just a cursor.
        this.contextualControls.hide();
        var parentNodes = SelectionContext.getNodeList(selection);

        // Do link stuff if in a link
        var linkNode = _.find(parentNodes, function(node) {
            return node.nodeName === 'A';
        });

        if (this.linkControl.isValidLink(linkNode)) {

            var coords = SelectionContext.getContextCoordinates($(this.element).parent().parent(),linkNode);

            this.linkControl.showOptions(linkNode);
            this.linkControl.showOverTarget(coords.x, coords.y);
        }
        else {
            this.linkControl.close();
        }

        this.staticControls.setActives(_.pluck(parentNodes, 'nodeName'));
    }

    /**
     * ### updateInlineToolbar
     *
     * If we're in an empty block that isn't the first one, open the inline toolbar.
     * Otherwise, close it!
     */
    function updateInlineToolbar() {
        var selection = SelectionContext.getSelection();
        var isCursor = selection && selection.isCollapsed;

        // Get out early if this isn't a cursor or not in context
        // Since this could be called frequently, we want to try and be efficient as possible
        if (!isCursor || !SelectionContext.isInContext(selection, this.element)) {
            this.inlineControls.close();
            return;
        }

        var node = getRootBlock.call(this);

        // If in a paragraph, but the editor is not empty
        if (node && node.nodeName === 'P' && this.dataFilter.isEmptyElement(node) && !this.isEmpty()) {
            this.inlineControls.open(node);
        } else if (this.isEmpty()) {
            // If editor editor, show next to placeholder
            this.inlineControls.open(node);
            var placeholderWidth = Utils.calcTextWidth(this.placeholderElement, this.config.placeholder);
            this.inlineControls.open(node, placeholderWidth);
        } else {
            this.inlineControls.close();
        }
    }

    /**
     * ### runPlaceholder
     *
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
     * ### trimDataToCharacterLimit
     *
     * Trim data length if the pasted content exceeds the set editor.config.characterLimit
     *
     * @param  {string} data
     * @return {string}
     */
    function trimDataToCharacterLimit(data) {
        var editorTextLength = this.element.innerText.length,
            characterLimit  = this.config.characterLimit;

        if ((editorTextLength + data.length) >= characterLimit) {
            var charDiff = characterLimit - editorTextLength;
            var allowedDataLength = charDiff > 0 ? charDiff : 0;
            data = data.slice(0, allowedDataLength);
        }

        return data;
    }

    /**
     * ### insertClientData
     *
     * Takes the clipboard data, filters it, and inserts into the editor.
     *
     * @param {object} clientData The clipboard data from the browser to use.
     */
    function insertClientData(clientData) {

        var data = '';

        if (clientData.items && clientData.items.length) {
            var imgItem = _.find(clientData.items, function(item) {
                return /image\/\w+/.test(item.type);
            });

            if (imgItem) {
                var blob = imgItem.getAsFile();
                if (blob) {
                    this.config.onFileAdded.call(this, blob);
                    return;
                }
            }
        }

        if (_.contains(clientData.types, 'text/html')) {
            data = clientData.getData('text/html');
        } else {
            data = clientData.getData('text/plain');
            data = this.dataFilter.filterPlaintext(data, true);
        }

        /**
         * Add line breaks inside the last cell in a row. This makes
         * pasting a column from a spreadsheet more managable in the editor.
         *
         * **WARNING**: This assumes we're not white listing `<TABLE>`.
         */
        data = data.replace(new RegExp('</t(d|h)></tr>', 'g'),'<br></td></tr>');

        // Convert `&nbsp;` to spaces
        data = data.replace(/\u00a0/g, ' ');

        // Run the HTML through the filter to strip out unsupported markup
        data = this.dataFilter.filterHTML(data);

        data = this.dataFilter.convertToBrowserSpaces(data);

        if (this.config.characterLimit) {
            data = trimDataToCharacterLimit.call(this, data);
        }

        // Dummy node is used to hold the html so we can parse through it
        var dummyNode = document.createElement('div');
        dummyNode.innerHTML = data;

        this.dataFilter.flattenBlocksDown(dummyNode, true);

        /**
         * Remove media elements on paste.
         *
         * TODO: We can re-enable image pastes once these conditions are met:
         *
         * 1. Images are uploaded to tumblr (see the image url paste code)
         * 2. We can reliably break apart blocks into 2 blocks.
         *    Currently we either insert inline html OR replace the entire block if empty
         * 3. Images inside of _inline_ html can be broken out reliably.
         * 4. Media embed service for iframe look ups are integrated.
         */
        $(dummyNode).find(MEDIA_ELEMENTS.join()).remove();

        var hasBlockChildren = _.some(dummyNode.children, function(element) {
            return _.contains(BLOCK_ELEMENTS, element.nodeName);
        });

        if (!hasBlockChildren) {
            // There are NO block children, go ahead and insert! This **will** preserve inline HTML.
            insertDataAtCursor.call(this, dummyNode.innerHTML);

        } else {

            // There are block children, we can't just insert it in there just yet.
            // Get the block we're inserting into and run some checks.
            var selection = SelectionContext.getSelection();
            var range = selection.getRangeAt(0);
            range.deleteContents();

            var blockToInsertTo = getRootBlock.call(this);

            // If the block we're inserting into is empty,
            // do a straight **replace** of this block with the data HTML
            if ($(blockToInsertTo).text().trim() === '') {

                // Store some info about our current situation in the DOM
                var oldIndex = $(blockToInsertTo).index();
                var parentNode = $(blockToInsertTo).parent();
                var newIndex = oldIndex + dummyNode.children.length - 1;

                $(blockToInsertTo).replaceWith(dummyNode.children);

                // Set the selection to the END of the LAST child element that we inserted
                var lastNewChildNode = $(parentNode).children().eq(newIndex).get(0);

                range.selectNodeContents(lastNewChildNode);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            else {
                // Inlinify the HTML, and only add the inline elements
                this.dataFilter.inlinify(dummyNode);
                insertDataAtCursor.call(this, dummyNode.innerHTML);
            }
        }

        this.onChange();
    }

    /**
     * ### setRawData
     *
     * Directly inserts HTML into the editor (**unfiltered**)
     *
     * @param {string} data The raw html to use for setting in the editor.
     */
    function setRawData(data) {
        $(this.element).html(data);
    }

    /**
     * ### getRawData
     *
     * @return {String} The HTML data inside this editor.
     */
    function getRawData() {
        return $(this.element).html().trim();
    }

    /**
     * ### insertDataAtCursor
     *
     * Inserts data at the current cursor location (or replaces selecion).
     *
     * @param {String} data The data (HTML or plain text) to insert
     * @param {Boolean} preventRangeCollapse
     */
    function insertDataAtCursor(data) {
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

        data = this.dataFilter.convertToBrowserSpaces(data);

        // Create a temp holder element to create a DOM from our data
        var temp = document.createElement('div');
        temp.innerHTML = data;
        var lastNode = temp.lastChild; // Save this for later

        // We need a DocumentFragment to add to the range
        // Go through the temp element and *move* all nodes to the fragment
        var frag = document.createDocumentFragment();
        var node;

        while ((node = temp.firstChild)) {
            // appendChild will _move_ the node from temp to fragment,
            // which allows this while loop to terminate
            frag.appendChild(node);
        }

        range.insertNode(frag);
        range.setStartAfter(lastNode); // Sets cursor position to the end

        range.collapse(false);

        selection.removeAllRanges();
        selection.addRange(range);

        // TODO: We might get stuck "in a link" here if the link is the last element.
        // Consider using a zero space char at the end to kick us out.
    }

    /**
     * ### getContextBlock
     *
     * Finds the block that is "in context".
     * This is either the parent block of wherever the cursor is
     * or the last block in the editor if no cursor.
     *
     * @return {object} A node for the block element in context.
     */
    function getContextBlock() {

        // Try to get the nearest node in our "context"
        var node = getRootBlock.call(this);

        if (!node) {

            // Otherwise, there's no context, so lets use the last block! xD

            var allBlocks = $(this.element).children(BLOCK_ELEMENTS.join());
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
     * ### getRootBlock
     *
     * Finds the root level block element for the current context. The current context is the
     * current or last selection in the editor.
     *
     * @return {object} The farthest "block" node that is a parent in context.
     */
    function getRootBlock() {
        var selection = SelectionContext.getSelection() || this.lastSelection;
        return SelectionContext.getNodeByNames(BLOCK_ELEMENTS, true, selection);
    }

    /**
     * ### enforceBlockContext
     *
     * Ensures that we have a block (paragraph) in the editor. Use as needed after setting data.
     */
    function enforceBlockContext() {
        var contextBlock = getContextBlock.call(this);

        if (!contextBlock) {
            setRawData.call(this, EMPTY_DATA);
            this.setCursorToStart();
        } else if (contextBlock.nodeName.toLowerCase() === 'div') {
            // Firefox throws for execCommand when formatBlock is run on non-editable content
            // Let's just fail silently in this case
            try {
                window.document.execCommand('formatBlock', false, '<p>');
            } catch (e) { }
        }
    }

    /**
     * ### enforceEndingTextBlock
     *
     * Ensures that we have a block (paragraph) in the editor. Use as needed after setting data.
     */
    function enforceEndingTextBlock() {
        var lastBlock = $(this.element).children(TEXT_BLOCKS.join()).last().get(0);
        if (!lastBlock) {
            $(this.element).append(EMPTY_DATA);
        }
    }

    /**
     * ### insertAsyncImage
     *
     * A special function for inserting images as media into the editor. It will create an unique
     * media key used to track the image throughout the life of the editor. This key can be used
     * later to update the image's source or restore source on undo/redo.
     *
     * @param {string} imgSource The source URI of the image add.
     * @param {File} [file] The image file to add.
     * @param {Node} [insertNode] An optional node to tell the editor where to add the image.
     * @param {Number} [insertDirection] An option to insert before(-1)/inside(0)/after(1) of node.
     */
    function insertAsyncImage(source, file, insertNode, insertDirection, skipSelectionUpdate) {

        var editor = this;

        var addImageBySource = function(src) {

            var key = _.uniqueId();
            var originalSource = src.lastIndexOf('data:', 0) === 0 ? 'file' : src;
            var img, $img, figure, $figure;

            editor.mediaTracker[key] = {
                originalSource: originalSource,
                file: file
            };

            $img = $('<img />', {
                'src': src
            });

            img = $img.get(0);

            $figure = $('<figure />');

            figure = $figure.get(0);

            $img.attr(editor.config.imgKeyAttr, key);

            $figure.append($img);

            insertMedia.call(editor, figure, insertNode, insertDirection, skipSelectionUpdate);

            getImageAttributes.call(editor, img, function (attributes) {
                addImageAttributes.call(editor, img, attributes);
                editor.config.onAsyncImageAdded.call(editor, key, src, file, attributes || {});
            });

            editor.onChange();
        };

        if (!source && file) {
            if (createObjectURL) {
                addImageBySource(createObjectURL(file));
            } else {
                var reader = new FileReader();
                reader.onload = function(e) {
                    addImageBySource(e.target.result);
                };
                reader.readAsDataURL(file);
            }
        } else if (typeof source === 'string') {
            addImageBySource(source);
        } else {
            editor.config.onAsyncImageFailed.call(editor);
            return;
        }
    }

    /**
     * ### addImageAttributes
     *
     * Apply various image attributes like width and height to an inline image based on editor config.
     *
     * @param {Element} img         The image to apply attributes to
     * @param {object} attributes   An object containing image attributes (currently width and height)
     */
    function addImageAttributes(img, attributes) {
        var elementsToAddImageAttrsTo, dataAttrs = {}, config = this.config;
        var figure = $(img).parent('figure').get(0);
        var attrKeyToElementMapping = {
            'toImg': img,
            'toImgParent': figure
        };
        if (config.addImgAttrs) {
            elementsToAddImageAttrsTo = _.reduce(attrKeyToElementMapping, function (memo, element, attr) {
                if (config.addImgAttrs === true || config.addImgAttrs[attr] === true) {
                    memo.push(element);
                }
                return memo;
            }, []);
        }
        if (!_.isEmpty(elementsToAddImageAttrsTo) && config.imgSizeAttrs && !_.isEmpty(attributes)) {
            if (config.imgSizeAttrs.height) {
                dataAttrs[config.imgSizeAttrs.height] = attributes.height;
            }
            if (config.imgSizeAttrs.height) {
                dataAttrs[config.imgSizeAttrs.width] = attributes.width;
            }
            $(elementsToAddImageAttrsTo).attr(dataAttrs);
        }
    }

    /**
     * ### getImageAttributes
     *
     * For a given image node, get various image attributes like width and height.
     *
     * @param {Element} img The image node to get attributes for.
     * @param {Function} callback The callback to execute with attribute object once attributes are available.
     */
    function getImageAttributes(img, callback) {
        var executeCallback = function (loadedImage) {
            var attrs = {
                width: loadedImage.naturalWidth,
                height: loadedImage.naturalHeight
            };
            if (_.isFunction(callback)) {
                callback.call(this, attrs);
            }
        };
        if (img.complete) {
            executeCallback.call(this, img);
        } else {
            // Add a couple of one-time listeners (we only care about load and error once)
            $(img).one({
                'load.getImageAttributes': _.bind(_.partial(executeCallback, img), this),
                'error': _.bind(function() {
                    // Might want to deal with this in a different way, but it's consistent with the existing behavior
                    $(img).off('.getImageAttributes');
                    callback.call(this, null);
                }, this)
            });
        }
    }

    /**
     * ### getAsyncImage
     *
     * Find an image element with a specific media key.
     *
     * @param {string} key The key to use for finding the image.
     * @return {Element} The image for this key.
     */
    function getAsyncImage(key) {
        return $(this.element).find('img[' + this.config.imgKeyAttr + '="' + key + '"]').get(0);
    }

    /**
     * ### updateAsyncImage
     *
     * Update an image with a specific key to use a new source.
     *
     * @param {string} key The key to use for find the image to update
     * @param {string} source The new source to use for the image.
     * @param {object} attributes Attributes to set on the image
     */
    function updateAsyncImage(key, src, attributes) {
        var img = getAsyncImage.call(this, key);
        if (!_.isEmpty(attributes)) {
            img && addImageAttributes.call(this, img, attributes);
        }
        if (src) {
            $(img).attr('src', src);
            this.mediaTracker[key].updatedSource = src;
        }
    }

    /**
     * ### insertMedia
     *
     * A very custom and deliberate way to add media inside the editor. It takes at either adjacent
     * node param or the current context and inserts a new "media block". Also, there's some checks
     * to be sure we have empty paragraphs at the start and end of editor if the media is added
     * to the beginning/end.
     *
     * TODO: Currently, data HTML *requires* a single element (can have chilren). We should consider
     * allowing any arbitrary HTML as "media".
     *
     * @param {String} data The html to insert inside this block.
     * @param {Node} parentNode The node to insert next to.
     * @param {Number} insertDirection Flag to insert before/inside/after of node.
     */
    function insertMedia(data, parentNode, insertDirection, skipSelectionUpdate) {

        var defaultDirection;

        parentNode = parentNode || getContextBlock.call(this);

        if (this.dataFilter.isEmptyElement(parentNode.outerHTML, true)) {
            defaultDirection = 0;
        } else if (SelectionContext.isCursorAtStart(parentNode)) {
            defaultDirection = -1;
        } else {
            defaultDirection = 1;
        }

        insertDirection = typeof insertDirection === 'number' ? insertDirection : defaultDirection;

        var mediaElement = $(data).get(0);
        var elementToInsert = wrapInMediaHolder.call(this, mediaElement);
        rebindMediaHolderEvents.call(this, elementToInsert);

        if (insertDirection < 0) {
            $(parentNode).before(elementToInsert);
        }
        else if (insertDirection > 0) {
            $(parentNode).after(elementToInsert);
        }
        else if (insertDirection === 0) {
            $(parentNode).replaceWith(elementToInsert);
        }

        closeControls.call(this);

        // Insert an adjacent node unless one already exists
        var nextNode = $(elementToInsert).nextAll(TEXT_BLOCKS.join()).get(0);
        if (!nextNode) {
            nextNode = $(EMPTY_DATA).get(0);
            $(elementToInsert).after(nextNode);
        }

        if (!skipSelectionUpdate) {
            this.focus(true);
            SelectionPersistence.setToStart(nextNode);
        }

        animateMedia.call(this, elementToInsert, false, runInterfaceUpdate);
    }

    /**
     * ### animateMedia
     *
     * Animate in/out media
     *
     * @param {Node} node Media holder node.
     * @param {Boolean} animateOut Specifies animation direction.
     * @param {Function} onComplete Animation complete callback.
     */
    function animateMedia(node, animateOut, onComplete) {
        var editor = this;

        animateOut = animateOut || false;
        onComplete = onComplete || _.noop;

        var $node = $(node);
        var $figure = $node.find('figure');
        var $mediaButtons = $node.find('.media-button');
        var duration = 200;

        // if no container or no figure... call callback
        if (!$node.length || !$figure.length) {
            onComplete.call(editor);
            return;
        }

        // hide media buttons
        if (animateOut && $mediaButtons.length) {
            $mediaButtons.hide();
        }

        // fade & slide figure
        animate($figure, {
            opacity: (animateOut) ? 0 : [1, 0],
            translateY: (animateOut) ? -25 : [0, -25]
        }, {
            duration: duration * 0.9,
            easing: 'easeOutQuad',
            complete: function() {
                $figure.removeAttr('style');
            }
        });

        // slide container in/out
        animate(node, (animateOut) ? 'slideUp' : 'slideDown', {
            duration: duration,
            easing: 'easeOutQuart',
            begin: function() {
                $node.css('pointer-events', 'none');
            },
            complete: function() {
                $node.css('pointer-events', '');
                onComplete.call(editor, node);
            }
        });
    }

    /**
     * ### updateMediaBoundaries
     *
     * Finds all the media elements and makes sure there is some editable element before and
     * after it so we can edit around media.
     */
    function updateMediaBoundaries() {

        var editor = this;

        var rootBlock = getRootBlock.call(this);
        $(rootBlock).removeClass(editor.config.fakeClass);

        // Update Fake Nodes
        $(editor.element).children('p').each(function(i,el) {

            if (rootBlock !== el && editor.dataFilter.isEmptyElement(el)) {
                // First or last empty next to media becomes fake
                if (
                    (i === 0 && isMediaHolder.call(editor, $(el).next().get(0))) ||
                    ($(el).is(':last-child') && isMediaHolder.call(editor, $(el).prev().get(0)))
                ) {
                    createFakeBlock.call(editor, el);
                }
                // Paragraphs between media
                else if (
                    isMediaHolder.call(editor, $(el).prev().get(0)) &&
                    isMediaHolder.call(editor, $(el).next().get(0)))
                {
                    createFakeBlock.call(editor, el);
                }
                // Remove fake blocks that don't meed this criteria
                else if ($(el).hasClass(editor.config.fakeClass)) {
                    $(el).remove();
                }
            }

            // Clean up empty classes
            if ($(el).attr('class') !== undefined && $(el).attr('class').trim() === '') {
                $(el).removeAttr('class');
            }
        });

       // Go through all the media and make sure they have previous/next nodes
       $(this.element).children('.' + this.config.mediaHolderClass).each(function(i, el) {
            var next = $(this).next().get(0);
            // Also check if the next element is media, we should add a paragraph betweeen
            if (!next || isMediaHolder.call(editor, next)) {
                $(this).after(createFakeBlock.call(editor));
            }
            var prev = $(this).prev().get(0);
            if (!prev) {
                $(this).before(createFakeBlock.call(editor));
            }
        });
    }

    /**
     * ### createFakeBlock
     *
     * Builds/modifies and returns a "fake" node with special hover properties. This is used to
     * assign special behavior to some blocks that will be filtered out when getting data, but are
     * available for editing.
     *
     * @param {Node} [node] An (optional) node to use for converting to a fake block.
     * @return {Node} The node that is now fake with hover states hooked up.
     */
    function createFakeBlock(node) {

        node = node || $(EMPTY_DATA).get(0);
        $(node).addClass(this.config.fakeClass);

        return node;
    }

    /**
     * ### wrapInMediaHolder
     *
     * Takes an element, and wraps it in a block holder.
     * Hooks up events for drag and drop moving and removing the entire block.
     * **NOTE:** Wrapping a block this way will make its contents NOT natively editable.
     *
     * @param {Element} The element to wrap in a media holder.
     * @return {Element} The media holder element used to wrap.
     */
    function wrapInMediaHolder(element) {
        var $el = $(element);

        // Wrapper block that's not editable. Prevents user from editing block natively
        var $holder = $('<div />', {
            'class': this.config.mediaHolderClass,
            'contentEditable': false,
            'draggable': true
        });

        $el.wrap($holder);
        $holder = $el.parent();

        // Need to add the media holder
        if (_.isFunction(this.config.mediaHolderCallback)) {
            this.config.mediaHolderCallback(this, element, $el, $holder);
        }

        // Block killer removes this block when clicked
        var mediaKiller = $(this.config.mediaKillerMarkup);
        mediaKiller.addClass('media-killer');
        $holder.append(mediaKiller);

        var hasMediaMover = !$holder.hasClass('media-holder-draggable');
        if (hasMediaMover) {
            var mediaMover = $(this.config.mediaMoverMarkup);
            mediaMover.addClass('media-mover');
            $holder.append(mediaMover);
        }

        return $holder;
    }

    /**
     * ### rebindMediaHolderEvents
     *
     * Sets up all the UI events we need for managing media, including:
     *
     * - Removal of block (click on media killer or delete key)
     * - Selection "state" on click
     *
     * Since some functions remove elements to the from the DOM, we end up losing our event
     * handlers for the media holders! Resolve this by using this function after any destructive
     * DOM manipulation (flattening blocks, etc).
     *
     * @param {Element} [element] An _optional_  element to rebind. If not provided, all
     * elements in the editor are searched.
     */
    function rebindMediaHolderEvents(element) {
        var editor = this;
        var $mediaHolders = element ? $(element) : $(this.element).find('[contenteditable="false"]');
        var customCallbacks = this.config.mediaHolderEvents;

        $mediaHolders.each(function(i, holder) {
            var $holder = $(holder);
            var lastClickEl = null;

            $holder.off('keydown').on('keydown', function(e) {
                customCallbacks.keydown.call(null, e, $holder);
                if (!e.isPropagationStopped()) {
                    if (e.keyCode === KEY_CODES['delete'] || e.keyCode === KEY_CODES.backspace) {
                        $holder.remove();
                    }
                    e.preventDefault();
                    e.stopPropagation(); // stops the browser from redirecting.
                }
            });
            $holder.off('keyup').on('keyup', function(e) {
                customCallbacks.keyup.call(null, e, $holder);
            });

            // Force our 'media-mover' as the only handle for dragging
            $holder.on('mousedown', function(e) {
                lastClickEl = e.originalEvent.target;
                customCallbacks.mousedown.call(null, e, $holder, lastClickEl);
            });
            $holder.on('mouseup', function(e) {
                customCallbacks.mouseup.call(null, e, $holder, lastClickEl);
                var $el = $(lastClickEl);
                // If lastClickEl is the media killer and mouseup is
                // on the media killer as well, kill the media...
                if ($el.hasClass('media-killer') && lastClickEl === e.target) {
                    animateMedia.call(editor, $holder, true, function() {
                        $holder.remove();
                        cleanupEmpties.call(editor);
                        runInterfaceUpdate.call(editor);
                        editor.onChange();
                    });
                }
            });

            // Use js for holder hover because iframes break css :hover in IE
            $holder.on('mouseenter', function(e) {
                $(e.currentTarget).addClass('show-controls');
                customCallbacks.mouseenter.call(null, e, $holder, lastClickEl);
            });
            $holder.on('mouseleave', function(e) {
                $(e.currentTarget).removeClass('show-controls');
                customCallbacks.mouseleave.call(null, e, $holder, lastClickEl);
            });

            $holder.on('dragstart', function(e) {
                var $el = $(lastClickEl);
                // Can't drag the media killer
                if ($el.hasClass('media-killer')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                // Drag if the holder is draggable or we grabbed the media mover
                if (!($holder.hasClass('media-holder-draggable') || $el.hasClass('media-mover'))) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                customCallbacks.dragstart.call(null, e, $holder, lastClickEl);
            });
        });
    }

    /**
     * ### removeMediaHolders
     *
     * Un-Wraps media that are inside a special media holder.
     *
     * @param {object} rootNode The node to start walking from
     */
    function removeMediaHolders(rootNode) {
        // Go through each media holder in the editor
        _.each($(rootNode).find('.' + this.config.mediaHolderClass), function(element) {

            // Remove the media controls
            $(element).find('.media-killer, .media-mover').remove();

            // Try to unwrap first child
            var firstChild = $(element).children().first();

            if (firstChild.length) {
                $(firstChild).unwrap();
            } else {
                // If no child nodes, wrap the text node THEN unwrap holder
                $(element).contents().wrap('<div>');
                $(element).children().first().unwrap().contents().unwrap();
            }
        });
    }
    /**
     * ### removeFakeBlocks
     *
     * Finds and strips out any "fake" blocks that the user didn't implicitly create.
     *
     * @param {object} rootNode The node to start walking from
     */
    function removeFakeBlocks(rootNode) {
        var editor = this;
        var fakeElements = $(rootNode).find('.' + this.config.fakeClass + ', .' + this.config.fakeClass + '-intent');

        _.each(fakeElements, function(element) {
            if (editor.dataFilter.isEmptyElement(element)) {
                $(element).remove();
            }
        });
    }

    /**
     * ### enforceMediaHolders
     *
     * Looks at all the media elements in the editor and makes sure they're wrapped in a media
     * holder element.
     */
    function enforceMediaHolders() {
        var editor = this;

        // Find all the media elements
        _.each($(this.element).find(MEDIA_ELEMENTS.join()), function(element) {
            // Only wrap the ones that aren't already wrapped or are inside another media element
            // Example: `figure > img` becomes `wrapper > figure > img`
            var parentNodes = SelectionContext.getParentNodes(element);
            var hasMediaParents = _.some(parentNodes, function(parentEl) {
                return _.contains(MEDIA_ELEMENTS, parentEl.nodeName);
            });

            if (!findMediaHolder.call(editor,element) && !hasMediaParents) {
                wrapInMediaHolder.call(editor, element);
            }
        });
    }

    /**
     * ### isMediaHolder
     *
     * Checks if this element is considered a "media holder".
     *
     * @param {Element} element The element to check against.
     * @return {Boolean} True if this element is a media holder, otherwise false.
     */
    function isMediaHolder(element) {
        return $(element).hasClass(this.config.mediaHolderClass);
    }

    /**
     * ### findMediaHolder
     *
     * Fetches the closest parent media holder for this element. There should only ever be "one"
     * media holder for an element, but this isn't the right place to enforce that nor do we need
     * to worry about that here.
     *
     * @param {Element} element The media element to look up from.
     * @return {Element} The wrapping media holder element. Returns `null` if not found.
     */
    function findMediaHolder(element) {
        var queryResult = $(element).closest('[class=' + this.config.mediaHolderClass + ']');
        return queryResult.length ? queryResult.get(0) : null;
    }

    /**
     * ### insertNewParagraph
     *
     * Creates a new paragraph (if there is not already an empty one) and places the cursor inside
     *
     * @param {DOMElement} element A DOM element to create the paragraph before/after. Defaults to current context block.
     * @param {String} before Set to true to insert before element. Defaults to false (i.e. after).
     * @param {Boolean} force Force creation of block (don't check for empty adjacent elements)
     * @return {DOMElement} The newly created paragraph
     */
    function insertNewParagraph(element, before, force) {
        var adjacentElement, newParagraph;

        before = _.isBoolean(before) ? before : false;
        element = element || getContextBlock.call(this);
        adjacentElement = $(element)[before ? 'prev' : 'next']();

        if (! force && adjacentElement.length > 0 && this.dataFilter.isEmptyElement(adjacentElement)) {
            SelectionPersistence.setToStart(adjacentElement.get(0));
            return adjacentElement;
        }

        newParagraph = $(EMPTY_DATA).get(0);
        $(element)[before ? 'before' : 'after'](newParagraph);
        SelectionPersistence.setToStart(newParagraph);
        return newParagraph;
    }

    /**
     * ## getData
     *
     * @param {Boolean} trim Should we trim the output? This _includes_ empty blocks!
     * @param {Boolean} keepImgAttrs Should we keep the special tracking attrs on images?
     * @return The HTML in the editor.
     */
    module.prototype.getData = function(trim, keepImgAttrs) {
        var editor = this;
        var data = getRawData.call(this);

        data = this.config.filterForGetData.call(this, data);

        if (this.config.runIFrameSanitization) {
            data = this.dataFilter.unSanitizeIFrames(data);
        }

        // Create a dummy node for us to use when cleaning up data
        var dummyNode = document.createElement('div');
        dummyNode.innerHTML = data;

        removeMediaHolders.call(this, dummyNode);
        removeFakeBlocks.call(this, dummyNode);

        if (!keepImgAttrs) {
            // Clean up media tracker attrs
            $(dummyNode).find('[' + editor.config.imgKeyAttr + ']').removeAttr(editor.config.imgKeyAttr );
        }

        // If passed in the flag to trim, remove empty elements at the beginning and end.
        if (trim) {

            var getEmptyEnd = function(endType) {
                var end = $(dummyNode).children(':' + endType +'-child').get(0);

                if (!end) { return null; }

                return editor.dataFilter.isEmptyElement(end, true) ? end : null;
            };
            var getEmptyEnds = function() {
                return _.compact([getEmptyEnd('first'), getEmptyEnd('last')]);
            };

            while (getEmptyEnds().length) {
                _.forEach(getEmptyEnds(), function(end) {
                    $(end).remove();
                });
            }
        }

        return dummyNode.innerHTML;
    };

    /**
     * ## setData
     *
     * Filters and sets the data into the editor. Will overwrite any
     * data currently in the editor.
     *
     * @param {String} data The HTML to set in the editor.
     * @param {Boolean} runFilter Flag to run the HTML filter on input.
     */
    module.prototype.setData = function(data, runFilter, runBlockRules) {
        if (runFilter) {
            data = this.config.filterForSetData.call(this, data);
            data = this.dataFilter.filterHTML(data);
        }

        if (this.config.runIFrameSanitization) {
            data = this.dataFilter.sanitizeIFrames(data);
        }

        setRawData.call(this, data);

        // Since we're setting data for EVERYTHING, run block rules on the entire element
        if (runBlockRules) {
            this.dataFilter.flattenBlocksDown(this.element);
        } else {
            this.dataFilter.blockifyInlineNodes(this.element);
        }

        // Ensure that SOME block in the editor
        enforceBlockContext.call(this);

        // Add media holders and make sure they respond to events
        enforceMediaHolders.call(this);
        rebindMediaHolderEvents.call(this);

        // Make sure we have a text block to write in at the end
        enforceEndingTextBlock.call(this);

        this.onChange();
    };

    /**
     * ## insertData
     *
     * Inserts data in the editor within the current context.
     *
     * @param {String} data The HTML to insert in the editor.
     * @param {Boolean} runFilter Flag to run the HTML filter on input.
     */
    module.prototype.insertData = function(data, runFilter, runBlockRules) {
        if (runFilter) {
            data = this.dataFilter.filterHTML(data);
        }

        insertDataAtCursor.call(this, data);

        if (runBlockRules) {
            this.dataFilter.flattenBlocksDown(SelectionContext.getNearestElement());
        }

        this.onChange();
    };

    /**
     * ## blur
     *
     * Call jQuery blur on the editor element.
     *
     * @param {Boolean} skipCloseControls Pass true to bypass closing controls after blur
     * @return {jQuery} the editor jQuery element
     */
    module.prototype.blur = function(skipCloseControls) {
        if (! skipCloseControls) {
            closeControls.call(this);
        }
        return $(this.element).blur();
    };

    /**
     * ## focus
     *
     * Call jQuery focus on the editor element.
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
     * ## hasFocus
     *
     * Does the editor have focus?
     *
     * @return {Boolean}
     */
    module.prototype.hasFocus = function() {
        return $(this.element).is(':focus');
    };

    /**
     * ## setPlaceholder
     *
     * @param  {String|Boolean} value The placeholder text to set in the editor. Pass false to disable.
     */
    module.prototype.setPlaceholder = function(value) {
        this.config.placeholder = value;
        runPlaceholder.call(this);
    };

    /**
     * ## insertMedia
     *
     * Inserts some "media" into editor context, wrapped in a media holder.
     *
     * @param {String} data The HTML to insert in the editor.
     * @param {Boolean} runFilter Flag to run the HTML filter on input.
     */
    module.prototype.insertMedia = function(data, runFilter, node, direction) {
        if (runFilter) {
            data = this.dataFilter.filterHTML(data);
        }
        insertMedia.call(this, data, node, direction);
        this.onChange();
    };

    /**
     * ## addControl
     *
     * Adds an element to the control bar for interface elements.
     * This only addes the element to the control bar location, and
     * is _not_ responsible for any events or functionality.
     *
     * @param {Element} controlElement The control to add to the control bar.
     */
    module.prototype.addControl = function(controlElement) {
        var controlBar = $(this.wrapper).find('[data-js=control-bar]');
        controlBar.append(controlElement);
    };

    /**
     * ## isEmpty
     *
     * Returns _true_ if the editor doesn't contain an logical data.
     * Note: _Considers the initial `EMPTY_DATA` html markup as empty_
     *
     * @return {Boolean} True if the editor is empty, otherwise false.
     */
    module.prototype.isEmpty = function() {
        var data = getRawData.call(this);
        return data === '' || data === '<br>' || data === EMPTY_DATA || data === EMPTY_PARAGRAPH;
    };

    /**
     * ## getCurrentElement
     *
     * Retrieve the the element that is in context of the current seleciton.
     *
     * @return {Element} The current element.
     */
    module.prototype.getCurrentElement = function() {
        return SelectionContext.getNearestElement();
    };

    /**
     * ## getAsyncImage
     *
     * See [getAsyncImage](#getAsyncImage) above.
     */
    module.prototype.getAsyncImage = function(key) {
        return getAsyncImage.call(this, key);
    };

    /**
     * ## insertAsyncImage
     *
     * See [insertAsyncImage](#insertAsyncImage) above.
     */
    module.prototype.insertAsyncImage = function(source, file, insertNode, direction, skipSelectionUpdate) {
        insertAsyncImage.call(this, source, file, insertNode, direction, skipSelectionUpdate);
        this.onChange();
    };

    /**
     * ## updateAsyncImage
     *
     * See [updateAsyncImage](#updateAsyncImage) above.
     */
    module.prototype.updateAsyncImage = function(key, source, attributes) {
        updateAsyncImage.call(this, key, source, attributes);
        this.onChange('updateAsyncImage');
    };

    /**
     * ## setCursorToStart
     *
     * Sets the selection as a cursor at the _begining_ of the _first_ element in the editor.
     *
     * @param {Boolean} skipRunInterfaceUpdate A flag to skip the normal interface update.
     */
    module.prototype.setCursorToStart = function(el, skipRunInterfaceUpdate) {
        var $editor = $(this.element);
        el = (el && $editor.find(el).first().get(0)) || $editor.children().first().get(0);
        if (el) {
            SelectionPersistence.setToStart(el);
        }
        if (!skipRunInterfaceUpdate) {
            runInterfaceUpdate.call(this);
        }
    };

    /**
     * ## setCursorToEnd
     *
     * Sets the selection as a cursor at the _end_ of the _last_ element in the editor.
     *
     * @param {Boolean} skipRunInterfaceUpdate A flag to skip the normal interface update.
     */
    module.prototype.setCursorToEnd = function(el, skipRunInterfaceUpdate) {
        var $editor = $(this.element);
        el = (el && $editor.find(el).last().get(0)) || $editor.children().last().get(0);
        if (el) {
            SelectionPersistence.setToEnd(el);
        }
        if (!skipRunInterfaceUpdate) {
            runInterfaceUpdate.call(this);
        }
    };

    /**
     * ## insertNewParagraphAfter
     *
     * Creates a new paragraph (if there is not already an empty one) and places the cursor inside
     *
     * @param {DOMElement} element A DOM element to create the paragraph after (defaults to current block)
     * @param {Boolean} force Force creation of block (don't check for empty adjacent elements)
     * @return {DOMElement} The newly created paragraph
     */
    module.prototype.insertNewParagraphAfter = function(element, force) {
        return insertNewParagraph.call(this, element, false, force);
    };

    /**
     * ## insertNewParagraphBefore
     *
     * Creates a new paragraph (if there is not already an empty one) and places the cursor inside
     *
     * @param {DOMElement} element A DOM element to create the paragraph before (defaults to current block)
     * @param {Boolean} force Force creation of block (don't check for empty adjacent elements)
     * @return {DOMElement} The newly created paragraph
     */
    module.prototype.insertNewParagraphBefore = function(element, force) {
        return insertNewParagraph.call(this, element, true, force);
    };

    /**
     * ## isEmptyElement
     *
     * Checks if an element is empty
     *
     * @param {DOMElement} element A DOM element to check (defaults to current block)
     * @return {Boolean} true if element is empty, false otherwise
     */
    module.prototype.isEmptyElement = function(element) {
        element = element || getContextBlock.call(this);
        return this.dataFilter.isEmptyElement(element);
    };

    /**
     * ## hasSelection
     *
     * @param {DOMElement} element A DOM element to check (defaults to current block)
     * @return {Boolean} Return true if there is an active selection
     */
    module.prototype.hasSelection = function(element) {
        element = element || getContextBlock.call(this);
        return SelectionContext.hasSelection(element);
    };

    /**
     * ## isCursorAtEnd
     *
     * Check if the cursor is at the end of an element
     *
     * @param {DOMElement} element A DOM element to check (defaults to current block)
     * @return {Boolean} true if the cursor is at the end / right of that element
     */
    module.prototype.isCursorAtEnd = function(element) {
        element = element || getContextBlock.call(this);
        return SelectionContext.isCursorAtEnd(element);
    };

    /**
     * ## isCursorAtStart
     *
     * Check if the cursor is at the start of an element
     *
     * @param {DOMElement} element A DOM element to check (defaults to current block)
     * @return {Boolean} true if the cursor is at the start / left of that element
     */
    module.prototype.isCursorAtStart = function(element) {
        element = element || getContextBlock.call(this);
        return SelectionContext.isCursorAtStart(element);
    };

    /**
     * ## teardown
     */
    module.prototype.teardown = function() {
        // add more teardown-y things here
        this.undoManager.teardown();
        this.keyComboEvents.off();
    };

    return module;
})();

module.exports = RichTextEditor;
