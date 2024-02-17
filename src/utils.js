/**
 * # Utils
 *
 * A place for various helper functions that we want to use throughout modules.
 *
 */
var _ = require('lodash');
var $ = require('jquery');

var Utils = (function() {

    var module = function() { };

    /**
     * ## calcTextWidth
     *
     * Calculates the width of a string value of text. Takes into account the weight, size, family, and style of the font.
     *
     * _Why is this using canvas?_
     *
     * This turned out to be the most reliable way to size that didn't involve complex layouts of a separate DOM element and having to find/replace repeating spaces (which are removed on render by default in the browser).
     *
     * _Why grab each font property separately?_
     *
     * Firefox returns an empty string when calling `$(styledElement).css('font')`. (u_u)'
     *
     * @param {Element} styledElement The element whose font properties you want to use.
     * @param {String} value The string value to measure.
     * @return Number The number of pixels this value theoretically takes up horizontally.
     */
    module.calcTextWidth = function(styledElement, value) {

        var fontProperties = ['font-style','font-weight','font-size', 'font-family'];
        var font = _.reduce(fontProperties, function(acc, prop) {
            return acc + ' ' + $(styledElement).css(prop);
        }, '').trim();

        var c = document.createElement('canvas');
        var ctx=c.getContext('2d');
        ctx.font = font;
        var measurement = ctx.measureText(value);
        return Math.round(measurement.width);
    };

    /**
     * ## browser
     *
     * Emulates the deprecated jQuery browser API.
     *
     * Source Code From: [jQuery 1.8.3 Deprecated](https://github.com/jquery/jquery/blob/1.8.3/src/deprecated.js#L9-L38)
     *
     * See <http://api.jquery.com/jquery.browser/> for usage instructions.
     */
    module.browser = (function() {
        var uaMatch = function(ua) {
            ua = ua.toLowerCase();

            var match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
                /(webkit)[ \/]([\w.]+)/.exec(ua) ||
                /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
                /(trident)[ \/]([\w.]+)/.exec(ua) ||
                /(msie) ([\w.]+)/.exec(ua) ||
                ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
                [];

            return {
                browser: match[ 1 ] || '',
                version: match[ 2 ] || '0'
            };
        };
        var matched = uaMatch(navigator.userAgent);
        var browser = {};

        if (matched.browser) {
            browser[ matched.browser ] = true;
            browser.version = matched.version;
        }

        // Newer versions of IE are Trident
        if(browser.trident) {
            browser.msie = true;
        }

        // Chrome is Webkit, but Webkit is also Safari.
        if (browser.chrome) {
            browser.webkit = true;
        } else if (browser.webkit) {
            browser.safari = true;
        }

        return browser;
    })();

    return module;

})();

module.exports = Utils;
