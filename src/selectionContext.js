/**
 * # Selection Context
 *
 * Specialized static class to handles retrieving information about the current selection and nodes.
 *
 * **NOTE:** The "context" as mentioned below node is within the nearest [contentediable] element.
 */
var _ = require('lodash');
var $ = require('jquery');

var SelectionContext = (function() {

    var getNodeIndex = function(node) {
        return Array.prototype.indexOf.call(node.parentNode.childNodes, node);
    };

    var isElement = function(node) {
        return node instanceof HTMLElement;
    };

    var selectionContext = {
        /**
         * ## getParentNodes
         *
         * Builds an ordered list of nodes by recursing through a node's parents.
         *
         * @param {Node} node The node to find the parents of
         * @param {Node[]} [nodeList] A list to initialize to, used for recursion.
         * @return {Node[]} The list of parents in order of closest to farthest.
         */
        getParentNodes: function(node, nodeList) {
            nodeList = nodeList || [];

            if(!node || selectionContext.isEditorNode(node)) {
                return nodeList;
            }

            var nextNode = node.parentNode;

            if(selectionContext.isEditorNode(nextNode)) {
                return nodeList;
            }
            if(!nextNode) {
                return nodeList;
            }
            else {
                nodeList.push(nextNode);
                return selectionContext.getParentNodes(nextNode, nodeList);
            }
        },
        /**
         * ## getRootElements
         *
         * Finds all the "root level" elemements in _this selection_,
         * ordered by their position as children in the editor element.
         *
         * @param {Selection} [selection] A selection to use for context.
         * @return {Node[]} An array of nodes that are immediate children of the editor.
         */
        getRootElements: function(selection) {
            selection = selection || selectionContext.getSelection();
            var startNode = selection && selection.anchorNode ? selection.anchorNode : null;

            if (!startNode || selectionContext.isEditorNode(startNode)) {
                return [];
            }

            var parentsOfStart = selectionContext.getParentNodes(startNode);
            var endNode = selection.focusNode;
            var parentsOfEnd =  selectionContext.getParentNodes(endNode);

            var startRoot = parentsOfStart.length ? parentsOfStart.pop() : startNode;
            var endRoot = parentsOfEnd.length ? parentsOfEnd.pop() : endNode;

            var startIndex = getNodeIndex(startRoot);
            var endIndex = getNodeIndex(endRoot);

            if(endIndex < startIndex) {
                var oldStart = startIndex;
                startIndex = endIndex;
                endIndex = oldStart;
            }

            var nodes = [];
            var rootNode = startRoot.parentNode;

            for(var i = startIndex; i <= endIndex; i++) {
                var childNode = rootNode.childNodes[i];
                if(isElement(childNode)) {
                    nodes.push(childNode);
                }
            }

            return nodes;

        },
        /**
         * ## getNodeList
         *
         * Builds a list of nodes for a selection with the following criteria:
         *
         * - Start and end nodes
         * - Parents of both start and end nodes
         *
         * @param {Selection} [selection] A selection to use for context.
         * @return {object[]} The list of nodes in context in order of closest to farthest.
         */
        getNodeList: function(selection, startOnly) {

            selection = selection || selectionContext.getSelection();

            var startNode = selection && selection.anchorNode ? selection.anchorNode : null;
            if (!startNode || selectionContext.isEditorNode(startNode)) {
                return [];
            }

            var endNode = selection.focusNode;
            var allNodes = [startNode];

            if (endNode && !selectionContext.isEditorNode(endNode)) {
                allNodes = allNodes.concat([endNode]);
            }

            var parentsOfStart = selectionContext.getParentNodes(startNode);
            allNodes = allNodes.concat(parentsOfStart);

            if (!startOnly) {
                var parentsOfEnd =  selectionContext.getParentNodes(endNode);
                allNodes = allNodes.concat(parentsOfEnd);
            }

            var nodes = _.union(allNodes);

            return nodes;
        },
        /**
         * ## getNearestNodeByNames
         *
         * Searchs through parent nodes for the first instance of a node that matches one of
         * these names. The farthestFirst option can be used to get the element of this type that
         * is farthest from the selection instead of nearest.
         *
         * @param {string[]} elementNames The names of the type of node to find.
         * @param {Boolean} [farthestFirst] Return the farthest node of this type instead of nearest. Defaults to false (nearest).
         * @param {Boolean} [selection] Optional selection to use for finding the nodes.
         */
        getNodeByNames: function(elementNames, farthestFirst, selection) {
            var nodeList = selectionContext.getNodeList(selection);
            nodeList = farthestFirst ? nodeList.reverse() : nodeList;

            return this.getNodesByNames(nodeList, elementNames)[0];
        },
        /**
         * ## getNodesByName
         *
         * Finds the nodes in the list that match a set of element names.
         * @param {Node[]} nodeList An array of nodes to search.
         * @param {string[]} elementNames An array of elements names to match against.
         * @return {Node[]} A filtered array of nodes.
         */
        getNodesByNames: function(nodeList, elementNames) {
            return _.filter(nodeList, function(node) {
                return _.indexOf(elementNames, node.nodeName) !== -1;
            });
        },

        /**
         * ## getNearestElement
         *
         * Finds the nearest node that is an "Element" type.
         * @param {Selection} [selection] A selection to use for getting nearest node.
         * @return The nearest Element node
         */
        getNearestElement: function(selection) {

            selection = selection || selectionContext.getSelection();
            var nodeList = selectionContext.getNodeList();

            return _.find(nodeList, function(node) {
                return node.nodeType === 1;
            });
        },
        /**
         * ## Get Context Coordinates
         *
         * Gets the coordinates of the "context" in the editor. This could be the location for a caret or
         * the middle of a box of a selection.
         *
         * @param {Element} containerElement The element to use for offset positioning.
         * @param {Node} [node] Optional node to use for the coordinates. Will not take into account selection when using a node.
         * @returns {object} A coordinate object with x and y positions relative to container element
         */
        getContextCoordinates: function(containerElement, node) {

            var selection = selectionContext.getSelection();
            var range = selection.getRangeAt(0).cloneRange();
            var offset = $(containerElement).offset();

            if(!node && selection.isCollapsed) {
                if (range.getClientRects) {
                    range.collapse(true);
                    var point = range.getClientRects()[0];
                    if(point) {
                        return {
                            x: point.left - offset.left,
                            y: point.top - offset.top + $(window).scrollTop()
                        };
                    }
                }
            }
            else {
                var boundary = (node || range).getBoundingClientRect();
                return {
                    x: boundary.left + (boundary.width / 2) - offset.left,
                    y: boundary.top - offset.top + $(window).scrollTop()
                };
            }
        },
        /**
         * ## Get Selection
         * Gets the selection object, only when inside our "context".
         * @return {object} A [selection][moz] object if in context or null
         * [moz]: https://developer.mozilla.org/en-US/docs/Web/API/Selection
         **/
        getSelection: function() {
            var selection = window.getSelection();

            if(selection.anchorNode) {
                var inContext = $(selection.anchorNode).closest('[contenteditable]').length;
                return inContext ? selection : null;
            }

            return null;
        },
        collapseToEnd: function() {
            var selection = selectionContext.getSelection();
            if(selection) {
                selection.collapseToEnd();
            }
        },
        collapseToStart: function() {
            var selection = selectionContext.getSelection();
            if(selection) {
                selection.collapseToStart();
            }
        },
        /**
         * ## isInContext
         * Verifies the context of a selection in relation to specific element.
         *
         * @param {Selection} selection A selection instance.
         * @param {Element} element The element the selection must be inside.
         * @return {Boolean} Is this selection in the "context" of this element?
         */
        isInContext: function(selection, element) {
            return $(selection.anchorNode).closest(element).length > 0;
        },

        /**
         * ##isEditor
         * @param {Element} element The element to check
         * @return {Boolean} Is this element contenteditable?
         */
        isEditorNode: function(element) {
            return $(element).is('[contentEditable="true"]');
        },

        /**
         * ## hasSelection
         *
         * @return {Boolean} Return true if there is an active selection
         */
        hasSelection: function() {
            var selection = selectionContext.getSelection();
            return selection && ! selection.isCollapsed;
        },

        /**
         * ## rangeFromElement
         *
         * Create a range object from an element
         *
         * @param {DOMElement} element A DOM element
         * @return {Range} a Range object
         */
        rangeFromElement: function (element) {
            var range, origRange, selection = selectionContext.getSelection();

            if (! selection || ! selection.isCollapsed) {
                return false;
            }

            origRange = selection.getRangeAt(0);
            range = origRange.cloneRange();
            range.selectNodeContents(element);
            range.setEnd(origRange.startContainer, origRange.startOffset);
            return range;
        },

        /**
         * ## isCursorAtEnd
         *
         * Check if the cursor is at the end of an element.
         *
         * @param {DOMElement} element A DOM element to check
         * @param {Boolean} trim A flag to trim both the range and the element textContent.
         * Sometimes we end up with extra spaces for the `element.textContent` that don't show up in
         * the range. This is likely due to the cursor being inside a child element inside the
         * element that we're passing as the first param.
         * @return {Boolean} true if the cursor is at the end / right of that element
         */
        isCursorAtEnd: function(element, trim) {
            var range = this.rangeFromElement(element);

            if (! range) {
                return false;
            }

            var rangeText = range.toString();
            var elementText = element.textContent;

            if (trim) {
                rangeText = rangeText.trim();
                elementText = elementText.trim();
            }

            return (rangeText.length === elementText.length);
        },

        /**
         * ## isCursorAtStart
         *
         * Check if the cursor is at the start of an element
         *
         * @param {DOMElement} A DOM element to check
         * @return {Boolean} true if the cursor is at the start / left of that element
         */
        isCursorAtStart: function(element) {
            var range = this.rangeFromElement(element);

            if (! range) {
                return false;
            }

            return (range.startOffset === 0 && range.endOffset === 0);
        }
    };

    return selectionContext;
})();

module.exports = SelectionContext;
