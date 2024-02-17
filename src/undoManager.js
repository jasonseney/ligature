/**
 * # Undo Manager
 *
 * A class that is initialized with an editor instance to override undo/redo key combos and
 * manage an internal state for the editor's _data_ and _selection_.
 *
 * There is no public API, this class handles everything interally using key events and the
 * editor's `onChange` function.
 */
var _ = require('lodash');
var $ = require('jquery');

var SelectionPersistence = require('./selectionPersistence');

var UndoManager = (function() {

    var KEY_CODES = { 'command': 91, 'control': 17, 'shift': 16, 'z': 90 };
    var TIME_BETWEEN_CHANGES = 500;

    /**
     * #### Constructor
     *
     * Set up the undo manager properties and tie into the editor's onChange hook for saving state.
     *
     * @param {Editor} editor An instance of a Ligature text editor.
     */
    var module = function(editor, afterRestore) {

        this.editor = editor;

        this.modifierKeyCode = false; // The code for the current modifier key. False if none.
        this.isShift = false; // Is shift being used right now? (Used for redo)

        // This is the representation of the current state.
        // After a change, this gets moved to the undo stack.
        this.currState = null;

        // Undo and redo stacks used for storing our custom states.
        this.undoStates = [];
        this.redoStates = [];

        this.afterRestore = afterRestore || function() { };

        /**
         * **Important: **
         *
         * This flag is used to prevent an infinate loop.
         *
         * Since we use the editor's public api for restoring data, and use `onChange` for
         * saving states, we would end up saving/restoring infiniately without this check.
         */
        this.isRestoring = false;

        var manager = this;

        // Use a debounced saver so that we don't save EVERY change.
        var saverDebounced = _.debounce(function() {
            if (! manager.isTorndown) { // until we get .cancel from lodash 3
                saveState.call(manager);
            }
        }, TIME_BETWEEN_CHANGES);

        this.defaultOnChange = editor.onChange;

        editor.onChange = function(type) {
            if(!manager.isRestoring ) {
                // Don't need to store async image updates in undo manager
                if(type === 'updateAsyncImage') {
                    return;
                }
                if(!manager.currState) {
                    // If no current state, make sure we save the inital state
                    saveState.call(manager);
                } else {
                    // Otherwise, use the debounced saver
                    saverDebounced();
                }
            } else {
                manager.isRestoring = false;
            }

            manager.defaultOnChange.call(this);
        };

        setupKeyHandlers.call(this);
    };

    /**
     * ### setupKeyHandlers
     *
     * Handles special key combos when inside the editor to trigger undo/redo.
     */
    function setupKeyHandlers() {
        var manager = this;

        var platformMetaKey = function(e) { return /Mac/.test(navigator.platform) ? e.metaKey : e.ctrlKey; };
        $(this.editor.element).on('keydown.undoManager', function(e) {
            if(e.keyCode === KEY_CODES.z && platformMetaKey(e) && !e.altKey) {
                if(e.shiftKey) {
                    redo.call(manager);
                } else {
                    undo.call(manager);
                }
                e.preventDefault();
                return false;
            }
        });
    }

    /**
     * ### undo
     *
     * Restores and sets to current the last state from the undo stack.
     */
    function undo() {

        saveState.call(this);

        if(this.undoStates.length) {
            var prevState = this.undoStates.pop();
            restoreState.call(this, prevState);
            this.redoStates.push(this.currState);
            resetCurrState.call(this);
        }
    }

    /**
     * ### redo
     *
     * Restores and sets to current the last state from the redo stack.
     */
    function redo() {
         if(this.redoStates.length) {
            var nextState = this.redoStates.pop();
            restoreState.call(this, nextState);
            this.undoStates.push(this.currState);
            resetCurrState.call(this);
         }
    }

    /**
     * ### resetCurrState
     * Updates the current state with a brand new one!
     */
    function resetCurrState() {
        this.currState = createState.call(this);
    }

    /**
     * ### createState
     *
     * Creates a new state from the editor.
     * @return {object} A state object reflecting the editor's data and selection.
     */
    function createState() {

        var newState = {
            data: this.editor.getData(true, true),
            selection: SelectionPersistence.saveSelection(this.editor.element)
        };

        return newState;
    }

    /**
     * ### saveState
     *
     * Stores an undo snapshot of the editor's data and selection to be used by the
     * undo stack.
     */
    function saveState() {

        var newState = createState.call(this);

        // If this is our first change, save it as current.
        if(!this.currState) {
            this.currState = newState;
            return;
        }

        if(newState.data !== this.currState.data) {
            this.undoStates.push(this.currState);
            this.currState = newState;
        }
    }

    /**
     * ### restoreState
     *
     * Updates the editor with data and selection for a particular state.
     *
     * @param Object state The custom state object to restore.
     */
    function restoreState(state) {
        this.isRestoring = true;
        this.editor.setData(state.data, true);
        if(state.selection) {
            SelectionPersistence.restoreSelection(state.selection);
        } else {
            var sel = window.getSelection();
            sel.removeAllRanges();
        }

        this.afterRestore();
    }

    module.prototype.undo = function() {
        undo.call(this);
    };

    module.prototype.redo = function() {
        redo.call(this);
    };

    module.prototype.teardown = function() {
        this.isTorndown = true;
        this.editor.onChange = this.defaultOnChange;
        this.undoStates.length = 0;
        this.redoStates.length = 0;
        this.currState = null;
        $(this.editor.element).off('.undoManager');
    };

    return module;

})();

module.exports = UndoManager;
