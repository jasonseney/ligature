/**
 * # Selection Peristence
 *
 * Utility Library for handling selection save / restores.
 *
 * Via this SO Question:
 * [Persisting the changes of range objects after selection in HTML](http://stackoverflow.com/a/13950376/26860)
 */
var SelectionPersistence = (function() {

    return {

        /**
         * ## saveSelection
         *
         * @param {DomElement} containerEl The container element to use for selection.
         * @return {object} A specialized selection object with `start` and `end` properties.
         */
        saveSelection: function(containerEl, selection) {

            // Check first that we have a valid selection
            selection = selection || window.getSelection();

            if(!selection || !selection.rangeCount) {
                return null;
            }

            var range = selection.getRangeAt(0);
            var start = 0;
            var nodeStack = [containerEl];
            var node;
            var lastNode;
            var done;

            while (!done && (node = nodeStack.pop())) {
                if (node.nodeType === node.TEXT_NODE) {
                    if (node === range.startContainer) {
                        start += range.startOffset;
                        done = true;
                    } else {
                        start += node.length;
                    }
                } else {
                    var i = node.childNodes.length;
                    // Don't count text inside non-contenteditable
                    if (node.getAttribute('contenteditable') !== 'false') {
                        while (i--) {
                            nodeStack.push(node.childNodes[i]);
                        }
                    }
                }
                lastNode = node;
            }

            return {
                container: containerEl,
                endContainer: range.endContainer,
                start: start,
                end: start + range.toString().length,
                selection: selection,
                anchorNode: selection.anchorNode
            };
        },

        /**
         * ## restoreSelection
         *
         * @param {object} selection A special selection object with `container`, `start`, and `end` attributes.
         */
        restoreSelection: function(savedSel) {

            // There's a chance we could have null saved selections
            if(!savedSel) {
                return;
            }

            var charIndex = 0;
            var range = document.createRange();
            range.setStart(savedSel.container, 0);
            range.collapse(true);
            var nodeStack = [savedSel.container];
            var node;
            var lastNode;
            var foundStart = false;
            var foundEnd = false;

            while (!foundEnd && (node = nodeStack.pop())) {

                if (node.nodeType === node.TEXT_NODE) {
                    var nextCharIndex = charIndex + node.length;
                    if (!foundStart && savedSel.start >= charIndex && savedSel.start < nextCharIndex) {
                        range.setStart(node, savedSel.start - charIndex);
                        foundStart = true;
                    }
                    // Weird edge case for restoring a "cursor" where start === end.
                    // If we haven't found the start yet, and the next char index is the end
                    // then set the start to the end.
                    if (!foundStart && nextCharIndex === savedSel.end) {
                        range.setStart(node, savedSel.end - charIndex);
                        foundStart = true;
                    }
                    if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
                        range.setEnd(node, savedSel.end - charIndex);
                        foundEnd = true;
                    }
                    charIndex = nextCharIndex;
                } else {
                    var i = node.childNodes.length;
                    // Don't try to select inside non-contenteditable
                    if (node.getAttribute('contenteditable') !== 'false') {
                        while (i--) {
                            nodeStack.push(node.childNodes[i]);
                        }
                    }
                }
                lastNode = node;
            }

            // Restore to the end container if we haven't already found the end. There's a chance
            // that the last element is a non-text node that is part of the selection.
            // (Empty <p>, for example)
            if(!foundEnd) {
                var pos = savedSel.end - charIndex;
                try {
                    range.setEnd(savedSel.endContainer, pos);
                } catch (e) { }
            }

            var sel = window.getSelection();
            sel.removeAllRanges();

            // IE throws an 'unspecified error' when adding an empty range to an empty selection
            try {
                sel.addRange(range);
            } catch (e) { }
        },

        /**
         * ## setToStart
         *
         * Position the cursor (collapsed) at the start of any element.
         *
         * @param {DomElement} element The element in which to set the cursor.
         */
        setToStart: function(element) {
            if(!element) {
                return;
            }
            var range = document.createRange();
            range.setStart(element, 0);
            range.setEnd(element, 0);
            range.collapse(true);

            var sel = window.getSelection();
            sel.removeAllRanges();

            // IE throws an 'unspecified error' when adding an empty range to an empty selection
            try {
                sel.addRange(range);
            } catch (e) { }
        },

        /**
         * ## setToEnd
         *
         * Position the cursor (collapsed) at the end of any element.
         *
         * *Why not just use setStartAfter/setEndAfter??*
         *
         * These functions will position the cursor outside the element, and at the beginning of
         * the next element, which is not what we want.
         *
         * @param {DomElement} element The element in which to set the cursor.
         */
        setToEnd: function(element) {

            var nodeStack = [element];
            var node = null;
            var lastNode = element;
            var charIndex = 0;

            while ((node = nodeStack.pop())) {
                if (node.nodeType === 3) {
                    lastNode = node;
                    charIndex = node.length;
                } else {
                    var i = node.childNodes.length;
                    while (i--) {
                        nodeStack.push(node.childNodes[i]);
                    }
                }
            }

            var range = document.createRange();
            range.setStart(lastNode, charIndex);
            range.setEnd(lastNode, charIndex);
            range.collapse(true);

            var sel = window.getSelection();
            sel.removeAllRanges();

            // IE throws an 'unspecified error' when adding an empty range to an empty selection
            try {
                sel.addRange(range);
            } catch (e) { }
        }
    };

})();

module.exports = SelectionPersistence;
