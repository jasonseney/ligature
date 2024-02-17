/*!
 * hoverintent v0.1.0 (2013-05-20)
 * http://tristen.ca/hoverintent
 * Copyright (c) 2013 ; Licensed MIT
*/

var hoverintent = function(el, over, out) {
    var x, y, pX, pY;
    var h = {},
        state = 0,
        timer = 0;

    var options = {
        sensitivity: 7,
        interval: 100,
        timeout: 0
    };

    var defaults = function(opt) {
        options = merge(opt || {}, options);
    };

    var merge = function(obj) {
        for (var i = 1; i < arguments.length; i++) {
            var def = arguments[i];
            for (var n in def) {
                if (obj[n] === undefined) obj[n] = def[n];
            }
        }
        return obj;
    };

    // Cross browser events
    var addEvent = function(object, event, method) {
        if (object.attachEvent) {
            object['e'+event+method] = method;
            object[event+method] = function(){object['e'+event+method](window.event);};
            object.attachEvent('on'+event, object[event+method]);
        } else {
            object.addEventListener(event, method, false);
        }
    };

    var removeEvent = function(object, event, method) {
        if (object.detachEvent) {
            object.detachEvent('on'+event, object[event+method]);
            object[event+method] = null;
        } else {
            object.removeEventListener(event, method, false);
        }
    };

    var track = function(e) { x = e.clientX; y = e.clientY; };

    var delay = function(el, outEvent, e) {
        if (timer) timer = clearTimeout(timer);
        state = 0;
        return outEvent.call(el, e);
    };

    var dispatch = function(e, event, over) {
        var tracker = function() {
            track(e);
        };

        if (timer) timer = clearTimeout(timer);
        if (over) {
            pX = e.clientX;
            pY = e.clientY;
            addEvent(el, 'mousemove', tracker);

            if (state !== 1) {
                timer = setTimeout(function() {
                    compare(el, event, e);
                }, options.interval);
            }
        } else {
            removeEvent(el, 'mousemove', tracker);

            if (state === 1) {
                timer = setTimeout(function() {
                    delay(el, event, e);
                }, options.timeout);
            }
        }
        return this;
    };

    var compare = function(el, overEvent, e) {
        if (timer) timer = clearTimeout(timer);
        if ((Math.abs(pX - x) + Math.abs(pY - y)) < options.sensitivity) {
            state = 1;
            return overEvent.call(el, e);
        } else {
            pX = x; pY = y;
            timer = setTimeout(function () {
                compare(el, overEvent, e);
            }, options.interval);
        }
    };

    // Public methods
    h.options = function(opt) {
        defaults(opt);
    };

    var dispatchOver = function(e) { dispatch(e, over, true); }
    var dispatchOut = function(e) { dispatch(e, out); }

    h.remove = function() {
        if (!el) return
        removeEvent(el, 'mouseover', dispatchOver);
        removeEvent(el, 'mouseout', dispatchOut);
    }

    if (el) {
        addEvent(el, 'mouseover', dispatchOver);
        addEvent(el, 'mouseout', dispatchOut);
    }

    defaults();
    return h;
};

module.exports = hoverintent;
