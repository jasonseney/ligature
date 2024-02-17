/**
 * # debugConsole
 *
 * Creates a special console object that will map noop functions when we're not in debug mode.
 */
var _ = require('lodash');
var Ligature = require('./ligature');

var api = [
    'assert',
    'clear',
    'constructor',
    'count',
    'debug',
    'dir',
    'dirxml',
    'error',
    'group',
    'groupCollapsed',
    'groupEnd',
    'info',
    'log',
    'markTimeline',
    'profile',
    'profileEnd',
    'table',
    'time',
    'timeEnd',
    'timeStamp',
    'timeline',
    'timelineEnd',
    'trace',
    'warn'
];

/**
 * Return a function that does either:
 *
 * - The normal browser's console behavior if in debug mode
 * - OR a noop function if _not_ in debug mode
 */
var getFunction = function(name) {
    return function() {
        return Ligature.debugMode ? window.console[name].bind(window.console).apply(this, arguments) : _.noop;
    };
};

var debugConsole = {};
_.each(api, function(funcName) {
    debugConsole[funcName] = getFunction(funcName);
});

module.exports = debugConsole;
