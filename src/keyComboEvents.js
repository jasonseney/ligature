/**
 * # Keyboard Helper
 *
 * A little pub-sub utility to help with keyboard combinations.
 *
 */

var _ = require('lodash');
var $ = require('jquery');
var HumanKeys = require('./humanKeys');

var KeyComboEvents = (function() {

    var module = function(options) {
        options                 = options || {};
        this.debounceRate       = options.debounceRate || 100;
        this.element            = options.element || document;
        this.humanKeys          = options.humanKeys || new HumanKeys();
        this.subscribers        = {};
        this.listening          = false;
    };

    function startListening() {
        // @todo: find a way to debounce this without breaking the stop-propagation of default browser actions
        $(this.element).on('keydown.keycombos', onKeyStroke.bind(this));
        this.listening = true;
    }

    function stopListening() {
        $(this.element).off('keydown.keycombos');
        this.listening = false;
    }

    function onKeyStroke(e) {
        var combo = this.humanKeys.translate(e);
        if (combo && hasCombo.call(this, combo)) {
            executeCallbacks.call(this, combo, e);
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }

    function executeCallbacks(combo, originalEvent) {
        _.each(getCallbacks.call(this, combo), function (c) {
            if (_.has(c, 'callback') && _.has(c, 'context')) {
                c.callback.call(c.context, originalEvent, combo);
            }
        });
    }

    function hasCombo(combo) {
        return getCallbacks.call(this, combo).length > 0;
    }

    function hasCallback(combo, callback) {
        var callbacks = getCallbacks.call(this, combo);
        return _.filter(callbacks, { 'callback': callback }).length > 0;
    }

    function getCallbacks(combo) {
        return _.has(this.subscribers, combo) ? this.subscribers[combo] : [];
    }

    function subscribe(combo, callback, context) {
        // this exact callback for this handler has already been added
        if (hasCallback.call(this, combo, callback)) {
            return;
        }
        if (! _.has(this.subscribers, combo)) {
            this.subscribers[combo] = [];
        }
        this.subscribers[combo].push({ 'callback': callback, 'context': context });
        if (! this.listening) {
            startListening.call(this);
        }
        return this;
    }

    function reset() {
        this.subscribers = {};
        stopListening.call(this);
    }

    function unsubscribe(combo, callback) {
        // no combo given, just remove everything
        if (! combo) {
            reset.call(this);
            return this;
        }
        // given combo does not exist
        if (! _.has(this.subscribers, combo)) {
            return this;
        }
        // remove a specific callback
        if (callback) {
            this.subscribers[combo] = _.reject(this.subscribers[combo], { 'callback': callback });
        }
        // remove all callbacks for a combo (or clear key if combo has no more callbacks)
        if (! callback || this.subscribers[combo].length === 0) {
            delete this.subscribers[combo];
        }
        // if no more subscribers, stop listening
        if (_.values(this.subscribers).length === 0) {
            stopListening.call(this);
        }
        return this;
    }

    module.prototype.on = function(combo, callback, context) {
        _.each((combo || '').split(' '), function (c) {
            subscribe.call(this, this.humanKeys.normalize(c), callback, context);
        }, this);
    };

    module.prototype.off = function(combo, callback) {
        if (combo) {
            _.each(combo.split(' '), function (c) {
                unsubscribe.call(this, this.humanKeys.normalize(c), callback);
            }, this);
        } else {
            unsubscribe.call(this, null, callback);
        }
    };

    return module;

})();

module.exports = KeyComboEvents;
