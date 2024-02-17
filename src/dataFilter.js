/**
 * # Data Filter
 *
 * Filters text for an editor based on a set of specific rules.
 *
 * Common examples are: stripping elements, attributes, and converting linebreaks to html.
 */
var _ = require('lodash');
var $ = require('jquery');

var Sanitize = require('./sanitize');

var DataFilter = (function() {

    var blockElements = ['P', 'FIGURE', 'H2', 'BLOCKQUOTE', 'UL', 'OL', 'PRE'];
    var mediaElements = ['FIGURE', 'IFRAME', 'IMG', 'HR'];
    var mediaHolderElement = 'DIV';
    var separatorElement = 'HR';

    var isBlock = function(element) {
        return _.contains(blockElements, element.nodeName);
    };

    var isMedia = function(element) {
        return element && _.contains(mediaElements, element.nodeName);
    };

    var hasMedia = function(element) {
        return $(element).find(mediaElements.join()).length;
    };

    var isContentEditableTurnedOff = function(element) {
        return $(element).attr('contenteditable') === 'false';
    };

    var getBlocks = function(elementList) {
        return _.filter(elementList, function(element) {
            return _.contains(blockElements, element.nodeName);
        });
    };

    /**
     * ## Constructor
     * Initalize the editor with our rules.
     * @param {object} sanitizeConfig The configuration of rules for filtering.
     */
    var module = function(sanitizeConfig) {
        this.sanitizeConfig = sanitizeConfig;
    };

    /**
     * ### wrapTextNodes
     *
     * Finds all immediate child text nodes, then wraps them in paragraphs.
     *
     * @param {Node} rootNode The root node to filter through.
     */
    function wrapTextNodes(rootNode) {

        // Cleans up and combines text nodes
        rootNode.normalize();

        // Find "floating text nodes" that don't have a block parent and wrap them in paragraphs
        var textWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);

        while(textWalker.nextNode()) {
            var textNode = textWalker.currentNode;
            var isFloating = $(textNode).parent().is(rootNode);

            if(isFloating && textNode.nodeValue.trim() !== '') {
                $(textNode).wrap('<p>');
            }
        }
    }

    /**
     * ### blockifyInlineNodes
     *
     * Finds all child nline elments, then wraps them in paragraphs.
     *
     * @param {Node} rootNode The root node to filter through.
     */
    function blockifyInlineNodes(rootNode) {

        wrapTextNodes(rootNode);

        // Find any "root level" inline elements and wrap them in a paragraph
        $(rootNode).children().each(function() {
            var el = $(this).get(0);
            var isMediaHolder = el.nodeName === mediaHolderElement;
            var isSeperator = el.nodeName === separatorElement;
            if(!isBlock(el) && !isMedia(el) && !isMediaHolder && !isSeperator) {
                $(this).wrap('<p>');
            }
        });
    }

    function getBlockNodes(rootNode) {
        return _.filter($(rootNode).find('*').toArray(), function(node) {
            return isBlock(node) || isContentEditableTurnedOff(node);
        });
    }

    /**
     * ### flattenBlocksDown
     *
     * Given a node to start from, will walk through child nodes
     * and remove any other wrapping block elements.
     *
     * @param {object} rootNode The node to start from to flatten inside
     * @param {boolean} preserveInline A flag to tell the function to tray to preserve root level inline
     * text and elements. Will avoid running the "blockify" unless the rootNode includes blocks.
     */
    function flattenBlocksDown(rootNode, preserveInline) {

        // Cleans up and combines text nodes
        rootNode.normalize();

        // Wraps any text nodes/inline HTML in paragraphs
        if(!preserveInline) {
            blockifyInlineNodes(rootNode);
        }

        var blockNodes = getBlockNodes(rootNode);

        /**
         * **Important:**
         * If no block nodes, and we want to preserve inline content, stop here.
         * TODO: Instead of blockifying everything flatten the block nodes!!!
         */
        if(!blockNodes.length && preserveInline) {
            return;
        } else if(preserveInline) {
            // We have block nodes, so much for preserving inline...
            blockifyInlineNodes(rootNode);
            blockNodes = getBlockNodes(rootNode);
        }

        $(rootNode).empty();

        // Go through each block node and re-add to the root node
        _.each(blockNodes, function(block) {

            // Do we have block children?
            var hasBlockChildren = _.some($(block).children().toArray(), function(element) {
                return isBlock(element);
            });

            // Only append blocks that:
            // - Are non contenteditable. We **DO NOT CARE** if there are nested blocks inside here.
            // - OR, don't have block children
            if(isContentEditableTurnedOff(block) || (!isEmptyElement(block) && !hasBlockChildren)) {
                $(rootNode).append(block);
            }
        });
    }

    /**
     * ### unBlock
     *
     * Given a node to start from, will walk through child blocks and unwrap the parent.
     *
     * **Important:**
     * The result is _very similar_ to the flattenBlocks method, and should eventually
     * replace that method which has some unexpected behavior that doesn't work well
     * in certain sets of nodes.
     *
     * @param {object} rootNode The node to start from to unblock inside
     */
    function unBlock(rootNode) {

        if(isContentEditableTurnedOff(rootNode)) {
            return;
        }

        var childBlocks = $(rootNode).children(blockElements.join()).toArray();
        var hasUnwrappedThisLevel = false;

        _.each(childBlocks, function(childBlock) {
            if(!hasUnwrappedThisLevel) {
                $(childBlock).unwrap();
                hasUnwrappedThisLevel = true;
            }
            unBlock(childBlock);
        });
    }

    function inlinify(rootNode, addNewline) {

        var blockNodes = getBlockNodes(rootNode);

        _.each(blockNodes, function(node) {
            // Remove list items - these aren't blocks but we don't want them
            $(node).find('li').contents().unwrap();
            if(addNewline) {
                $(node).find('br:last-child').remove();
                $(node).append('<br>');
            }
            $(node).contents().unwrap();
        });
    }

    function unwrapParentBlocks(parentNodes) {

        var blocks = getBlocks(parentNodes);

        blocks.shift(); // Preserve FIRST block :D

        var wrappingBlock = blocks.shift();

        // Go through the containing blocks and unwrap until we hit the editor element
        while(wrappingBlock && !$(wrappingBlock).is('[contentEditable]')) {

            // Store the parent for clean up later
            var parent = wrappingBlock.parentNode;

            $(wrappingBlock).contents().unwrap();

            // Cleanup
            blockifyInlineNodes(parent);

            wrappingBlock = blocks.shift();

        }
    }

    /**
     * ## scrubSpansAndBadAttrs
     *
     * Walks through each node and:
     *
     * - Unwrap spans
     * - Remove style attributes
     *
     * We want to return a flag to tell the user of this function if we removed any spans
     * so they can update the selection accordingly if needed.
     *
     * @param {array} nodes The nodes to go through for scrubbing.
     * @return {boolean} True if we removed any spans, false otherwise.
     */
    function scrubSpansAndBadAttrs(nodes) {
        if(!nodes || !nodes.length) {
            return;
        }
        var node = nodes.shift();
        var hasSpans = false;
        /**
         * These are attributes that browsers add in contenteditable
         * If we find that we *must* keep these attributes, consider using the sanitize config
         * for more configurable scrubbing.
         */
        var badAttrs = ['style','dir'];

        while(node) {
            var spans = $(node).find('span').toArray();
            // If this node itself is a span, unwrap it
            if(node.nodeName === 'SPAN') {
                spans.push(node);
            }
            if(spans.length) {
                hasSpans = true;
            }
            $(spans).contents().unwrap();

            _.each(badAttrs, function(attr) {
                $(node).removeAttr(attr);
                $(node).find('[' + attr + ']').removeAttr(attr);
            });
            node = nodes.shift();
        }
        return hasSpans;
    }

    /**
     * ### Is Empty Element
     * Checks if an element's text is empty and that it's not media.
     * @param {Element} element An element to check against
     * @param {Boolean} trim A flag to say if we want to trim the element text before checking
     * @return {Boolean} true if empty, false if not empty.
     */
    function isEmptyElement(element, trim) {
        var text = $(element).text();
        if(trim) {
            text = text.replace(/\n|\r/gm, '').trim();
        }
        var isSeperator = element && element.nodeName === separatorElement;
        return text === '' && !isMedia(element) && !hasMedia(element) && !isSeperator;
    }

    /**
     * ### nodeFromString
     * Safely convert an HTML string to a node
     * @param {String} string An HTML snippet
     * @return {Element} A body node
     */
    function nodeFromString(string) {
        var doc = document.implementation.createHTMLDocument('');
        doc.body.innerHTML = string;
        return doc.body;
    }

    /**
     * ### wrapNode
     * Safely place a node inside a document (useful for getting the node's HTML)
     * @param {Element} node The node to wrap
     * @return {Element} A document body
     */
    function wrapNode(node) {
        var doc = document.implementation.createHTMLDocument('');
        doc.body.appendChild(node.cloneNode(true));
        return doc.body;
    }

    module.prototype.flattenBlocksDown = function(rootNode, attemptInlinePreserve) {
        flattenBlocksDown(rootNode, attemptInlinePreserve);
    };

    module.prototype.unBlock = function(rootNode) {
        unBlock(rootNode);
    };

    module.prototype.unwrapParentBlocks = function(parentNodes) {
        unwrapParentBlocks(parentNodes);
    };

    module.prototype.scrubSpansAndBadAttrs = function(nodes, allowContentEditable) {
        return scrubSpansAndBadAttrs(nodes, allowContentEditable);
    };

    module.prototype.blockifyInlineNodes = function(rootNode) {
        blockifyInlineNodes(rootNode);
    };

    module.prototype.inlinify = function(rootNode, addNewline) {
        inlinify(rootNode, addNewline);
    };

    module.prototype.getBlockNodes = function(rootNode) {
        return getBlockNodes(rootNode);
    };

    module.prototype.isEmptyElement = function(element, trim) {
        return isEmptyElement(element,trim);
    };
    /**
     * ## Filter HTML
     *
     * Strips out unwanted HTML elements and attributes
     *
     * @param {String} input The raw HTML to filter through
     * @return {String} Filtered and sanitized HTML
     */
    module.prototype.filterHTML = function(input) {

        // Wrap input in a dummy element (required for Santize)
        var dummyInputNode = nodeFromString(input);

        var sanitizer = new Sanitize(this.sanitizeConfig);

        // Get a DocumentFragment back after cleaning
        var cleanFragment = sanitizer.clean_node(dummyInputNode);

        // Wrap the fragment in a div in order to generate HTML from fragment
        var dummyOutputNode = wrapNode(cleanFragment);

        // Get the html string from inside the div
        var cleanHTML = dummyOutputNode.innerHTML;

        // Remove empty paragraphs
        var output = cleanHTML.replace(/[<]p[>][ ]*[<]\/p[>]/g,'');

        return output;
    };

    /**
     * ## Filter Plaintext
     *
     * A filtering function that:
     *
     * 1. Escapes HTML entities
     * 2. Converts linebreaks to HTML linebreaks
     * 3. (Optional) Wrap in <p> and convert double linebreaks to paragraphs
     *
     * @param {String} input The text to filter through
     * @param {Boolean} useParagraphs Flag to tell the fileter if we should use paragraphs
     * for double line breaks and wrapping the entire input.
     * @return {String} Filtered and sanitized plaintext
     */
    module.prototype.filterPlaintext = function(input, useParagraphs) {
        // Escape HTML
        var output = _.escape(input);

        // Normalize line endings
        // Convert all line-endings to UNIX format
        output = output.replace(/\r\n/g, '\n');
        output = output.replace(/\r/g, '\n');

        // Convert double linebreaks to paragraph close
        if(useParagraphs) {
            output = output.replace(/\n([ ]*\n)+/g, '</p><p>');
        }

        // Convert single line breaks to HTML linebreaks
        output = output.replace(/\n/g,'<br>');

        if(useParagraphs) {
            output = '<p>' + output + '</p>';
        }

        return output;
    };

    /**
     * ## convertToBrowserSpaces
     *
     * Attempts to emulate the behavior of how browsers create spaces when editing:
     *
     * 1. Double spaces are convert to ` &nsbp;` (single space followed by non breaking space)
     * 2. The last space in this string is converted to `&nbsp;`. This allows us to set the
     * selection to the end of the string after the space.
     *
     * @param {String} data The input string to filter.
     */
    module.prototype.convertToBrowserSpaces = function(data) {

        return data
            // Replace double spaces with space plus &nbsp; so it is displayed correctly.
            .replace(/[ ]{2}/g, ' \u00a0')
            // Replace trailing space with &nbsp; so that the cursor will collapse to the end properly.
            .replace(/[ ]$/, '\u00a0');
    };

    /**
     * ## Sanitize iFrames
     *
     * Removes the `src` attribute for iframes to prevent frame breaking scripts.
     * The original source is preserved as `data-original-src` to be added back later on output.
     * @param {String} input The markup to sanitize iframes for
     * @return {String} The markup with iFrames sanitized
     */
    module.prototype.sanitizeIFrames = function(input) {

        var dummyInputNode = nodeFromString(input);

        $(dummyInputNode).find('iframe').each(function() {
            $(this).attr('data-original-src', $(this).attr('src'));
            $(this).attr('src','javascript:\'\'');
        });

        return dummyInputNode.innerHTML;
    };

    /**
     * ## Un-Sanitize iFrames
     *
     * Replaces the `src` attribute on iFrames from the `data-original-src` value.
     *
     * @param {String} input The markup to un-sanitzed iframes for
     * @return {String} The markup with original iFrames sources restored
     */
    module.prototype.unSanitizeIFrames = function(input) {

        var dummyInputNode = nodeFromString(input);

        $(dummyInputNode).find('iframe[data-original-src]').each(function() {
            $(this).attr('src', $(this).attr('data-original-src'));
            $(this).removeAttr('data-original-src');
        });

        return dummyInputNode.innerHTML;
    };

    return module;

})();

module.exports = DataFilter;
