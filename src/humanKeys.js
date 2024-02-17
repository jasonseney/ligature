/**
 * # Human Keys
 *
 * Translate a keyboard event to a human-readable format (e.g. event -> alt+ctrl+delete)
 *
 */

var _ = require('lodash');

var HumanKeys = (function() {

    var DEFAULT_MODIFIERS = ['ctrl', 'meta', 'alt', 'shift'];

    var DEFAULT_SEPARATOR = '+';

    var DEFAULT_SPECIAL_KEYS = {
        37: 'LEFT',
        38: 'UP',
        39: 'RIGHT',
        40: 'DOWN',
        187: 'PLUS',
        61: 'PLUS',
        188: 'COMMA',
        189: 'MINUS',
        173: 'MINUS',
        190: 'DOT',
        32: 'SPACE'
    };

    var DEFAULT_PRETTY_MAPPING = {
        LEFT: '\u2190',
        RIGHT: '\u2192',
        DOWN: '\u2193',
        UP: '\u2191',
        PLUS: '\u002B',
        COMMA: '\u002C',
        MINUS: '\u002D',
        DOT: '\u002E',
        SPACE: 'Space'
    };

    var DEFAULT_PLATFORM_MODIFIERS = {
        Win: {
            meta: 'ctrl'
        },
        Linux: {
            meta: 'ctrl'
        }
    };

    var DEFAULT_PLATFORM_PRETTY_MAPPING = {
        Mac: {
            meta: '\u2318',
            shift: '\u21E7',
            alt: '\u2325'
        }
    };

    var DEFAULT_PLATFORM_PRETTY_SEPARATORS = {
        Win: '-',
        Linux: '-',
        Mac: ''
    };

    var module = function(options) {
        options                         = options || {};
        this.modifiers                  = options.modifiers || DEFAULT_MODIFIERS;
        this.separator                  = options.separator || DEFAULT_SEPARATOR;
        this.specialKeys                = options.specialKeys || DEFAULT_SPECIAL_KEYS;
        this.prettyMapping              = options.prettyMapping || DEFAULT_PRETTY_MAPPING;

        this.platformModifiers          = options.platformsModififiers || DEFAULT_PLATFORM_MODIFIERS;
        this.platformPrettyMapping      = options.platformPrettyModifiers || DEFAULT_PLATFORM_PRETTY_MAPPING;
        this.platformPrettySeperators   = options.platformPrettySeperators || DEFAULT_PLATFORM_PRETTY_SEPARATORS;
    };

    function getPlatform() {
        if (navigator.platform.match(/^Win/i)) {
            return 'Win';
        } else if (navigator.platform.match(/^Mac/i)) {
            return 'Mac';
        } else if (navigator.platform.match(/^Linux/i)) {
            return 'Linux';
        }
        return navigator.platform;
    }

    function getPrettyMapping() {
        return _.extend({}, this.prettyMapping, this.platformPrettyMapping[getPlatform.call(this)]);
    }

    function getModifiers() {
        return this.platformModifiers[getPlatform.call(this)] || {};
    }

    function getPrettySeperator() {
        var platform = getPlatform.call(this);
        return _.has(this.platformPrettySeperators, platform) ? this.platformPrettySeperators[platform] : this.seperator;
    }

    function getCharacterFromEvent(e) {
        return this.specialKeys[e.keyCode] || String.fromCharCode(e.keyCode);
    }

    function getModifiersFromEvent(e) {
        return _.filter(this.modifiers, function(m) {
            return (e[m + 'Key']);
        });
    }

    function capitalize(string) {
        return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
    }

    /**
     * ### Translate
     *
     * @param {Event} keyEvent A keyboard event (keyup, keydown)
     * @Return {String} commandString A human readable representation (alt+ctrl+delete)
     */
    module.prototype.translate = function(keyEvent) {
        var modifiers = getModifiersFromEvent.call(this, keyEvent);
        if (modifiers.length === 0) {
            return null;
        }
        return modifiers.concat(getCharacterFromEvent.call(this, keyEvent)).join(this.separator);
    };

    /**
     * ### Normalize
     *
     * @param {String} combo A human readable combo (F+meta)
     * @Return {String} A correctly ordered platform-specific combo (mac: meta+F, win: ctrl+F)
     */
    module.prototype.normalize = function(combo) {
        var remaining = combo.split(this.separator);
        var map = getModifiers.call(this);
        var modifiers = '';
        _.each(this.modifiers, function (m) {
            var index = _.indexOf(remaining, m.toLowerCase()), modifier = map[m] || m;
            if (index >= 0) {
                modifiers += (modifier + this.separator);
                remaining.splice(index, 1);
            }
        }, this);
        return modifiers + remaining.join(this.separator).toUpperCase();
    };

    /**
     * ### Pretty
     *
     * @param {String} eventName A combo string
     * @Return {String} A normalized and prettified string
     */
    module.prototype.pretty = function(combo) {
        var normalized = this.normalize(combo);
        var map = getPrettyMapping.call(this);
        var prettySeperator = getPrettySeperator.call(this);
        return _.map(normalized.split(this.separator), function (k) {
            return map[k] || capitalize(k);
        }, this).join(prettySeperator);
    };

    return module;

})();

module.exports = HumanKeys;
