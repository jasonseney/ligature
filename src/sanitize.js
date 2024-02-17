/**
 * Copyright (c) 2010 by Gabriel Birke
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

function Sanitize(){
  var i, options;
  options = arguments[0] || {};
  this.config = {};
  this.config.elements = options.elements ? options.elements : [];
  this.config.attributes = options.attributes ? options.attributes : {};
  this.config.attributes[Sanitize.ALL] = this.config.attributes[Sanitize.ALL] ? this.config.attributes[Sanitize.ALL] : [];
  this.config.allow_comments = options.allow_comments ? options.allow_comments : false;
  this.allowed_elements = {};
  this.config.protocols = options.protocols ? options.protocols : {};
  this.config.classnames = options.classnames ? options.classnames : {};
  this.config.add_attributes = options.add_attributes ? options.add_attributes  : {};
  this.dom = options.dom ? options.dom : document;
  for(i=0;i<this.config.elements.length;i++) {
    this.allowed_elements[this.config.elements[i]] = true;
  }
  this.config.remove_element_contents = {};
  this.config.remove_all_contents = false;
  if(options.remove_contents) {

    if(options.remove_contents instanceof Array) {
      for(i=0;i<options.remove_contents.length;i++) {
        this.config.remove_element_contents[options.remove_contents[i]] = true;
      }
    }
    else {
      this.config.remove_all_contents = true;
    }
  }
  this.transformers = options.transformers ? options.transformers : [];
}

Sanitize.REGEX_PROTOCOL = /^([A-Za-z0-9\+\-\.\&\;\*\s]*?)(?:\:|&*0*58|&*x0*3a)/i;

// emulate Ruby symbol with string constant
Sanitize.RELATIVE = '__RELATIVE__';
Sanitize.ALL = '__ALL__';

Sanitize.prototype.clean_node = function(container) {
  var fragment = this.dom.createDocumentFragment();
  this.current_element = fragment;
  this.whitelist_nodes = [];



  /**
   * Utility function to check if an element exists in an array
   */
  function _array_index(needle, haystack) {
    var i;
    for(i=0; i < haystack.length; i++) {
      if(haystack[i] === needle)
        return i;
    }
    return -1;
  }

  function _merge_arrays_uniq() {
    var result = [];
    var uniq_hash = {};
    var i,j;
    for(i=0;i<arguments.length;i++) {
      if(!arguments[i] || !arguments[i].length)
        continue;
      for(j=0;j<arguments[i].length;j++) {
        if(uniq_hash[arguments[i][j]])
          continue;
        uniq_hash[arguments[i][j]] = true;
        result.push(arguments[i][j]);
      }
    }
    return result;
  }

  /**
   * Clean function that checks the different node types and cleans them up accordingly
   * @param elem DOM Node to clean
   */
  function _clean(elem) {
    var clone;
    switch(elem.nodeType) {
      // Element
      case 1:
        _clean_element.call(this, elem);
        break;
      // Text
      case 3:
        clone = elem.cloneNode(false);
        this.current_element.appendChild(clone);
        break;
      // Entity-Reference (normally not used)
      case 5:
        clone = elem.cloneNode(false);
        this.current_element.appendChild(clone);
        break;
      // Comment
      case 8:
        if(this.config.allow_comments) {
          clone = elem.cloneNode(false);
          this.current_element.appendChild(clone);
        }
        break;
      default:
        if (console && console.log) console.log('unknown node type', elem.nodeType);
        break;
    }

  }

  function _filter_array(arr, whitelist) {
    var arr_filtered = [];
    for (var i = 0; i < arr.length; i++) {
      if (_array_index(arr[i], whitelist) !== -1) {
        arr_filtered.push(arr[i]);
      }
    }
    return arr_filtered;
  }

  function _clean_element(elem) {
    var i, parent_element, name, allowed_attributes, attr, attr_name, attr_node, attr_value, protocols, del, attr_ok;
    var transform = _transform_element.call(this, elem);

    elem = transform.node;
    name = elem.nodeName.toLowerCase();

    // check if element itself is allowed
    parent_element = this.current_element;
    if(this.allowed_elements[name] || transform.whitelist) {
        this.current_element = this.dom.createElement(elem.nodeName);
        parent_element.appendChild(this.current_element);

      // clean attributes
      var attrs = this.config.attributes;
      allowed_attributes = _merge_arrays_uniq(attrs[name], attrs[Sanitize.ALL], transform.attr_whitelist);
      if (this.config.classnames[name] && this.config.classnames[name].length) {
        allowed_attributes.push('class');
      }
      for(i=0;i<allowed_attributes.length;i++) {
        attr_name = allowed_attributes[i];

        // Check for an object, which allows us to stricly validate the _value_ of the attribute.
        var isObject = typeof allowed_attributes[i] === 'object' || allowed_attributes[i] instanceof Object;
        attr_name = isObject ? allowed_attributes[i].name : allowed_attributes[i];

        attr = elem.attributes[attr_name];

        if(attr) {
            attr_value = attr.value;
            var attr_value_lc = attr_value.toLowerCase();
            attr_ok = true;
            // Check protocol attributes for valid protocol
            if(this.config.protocols[name] && this.config.protocols[name][attr_name]) {
              attr_ok = false; // assume it's a bad protocol, if we're doing the checks
              protocols = this.config.protocols[name][attr_name];
              protocols.push(Sanitize.RELATIVE); // preserve whatever this is
              // if it's one of our valid protocols, let it pass
              for (var i in protocols) {
                if (attr_value_lc.indexOf(protocols[i].toLowerCase()) === 0) {
                  attr_ok = true;
                  break;
                }
              }
            }
            // Filter to valid classnames
            if(attr_name === 'class' && this.config.classnames[name]) {
              attr_value = _filter_array(attr_value.split(' '), this.config.classnames[name]).join(' ');
              attr_ok = !!attr_value;
            }
            // Check if the value matches
            if(isObject) {
                attr_ok = attr_value_lc.match(allowed_attributes[i].value);
            }
            if(attr_ok) {
              attr_node = document.createAttribute(attr_name);
              attr_node.value = attr_value;
              this.current_element.setAttributeNode(attr_node);
            }
        }
      }

      // Add attributes
      if(this.config.add_attributes[name]) {
        for(attr_name in this.config.add_attributes[name]) {
          attr_node = document.createAttribute(attr_name);
          attr_node.value = this.config.add_attributes[name][attr_name];
          this.current_element.setAttributeNode(attr_node);
        }
      }
    } // End checking if element is allowed
    // If this node is in the dynamic whitelist array (built at runtime by
    // transformers), let it live with all of its attributes intact.
    else if(_array_index(elem, this.whitelist_nodes) !== -1) {
      this.current_element = elem.cloneNode(true);
      // Remove child nodes, they will be sanitiazied and added by other code
      while(this.current_element.childNodes.length > 0) {
        this.current_element.removeChild(this.current_element.firstChild);
      }
      parent_element.appendChild(this.current_element);
    }

    // iterate over child nodes
    if(!this.config.remove_all_contents && !this.config.remove_element_contents[name]) {
      for(i=0;i<elem.childNodes.length;i++) {
        _clean.call(this, elem.childNodes[i]);
      }
    }

    // some versions of IE don't support normalize.
    if(this.current_element.normalize) {
      this.current_element.normalize();
    }
    this.current_element = parent_element;
  } // END clean_element function

  function _transform_element(node) {
    var output = {
      attr_whitelist:[],
      node: node,
      whitelist: false
    };
    var i, j, transform;
    for(i=0;i<this.transformers.length;i++) {
      transform = this.transformers[i]({
        allowed_elements: this.allowed_elements,
        config: this.config,
        node: node,
        node_name: node.nodeName.toLowerCase(),
        whitelist_nodes: this.whitelist_nodes,
        dom: this.dom
      });
      if (transform === null)
        continue;
      else if(typeof transform === 'object') {
        if(transform.whitelist_nodes && transform.whitelist_nodes instanceof Array) {
          for(j=0;j<transform.whitelist_nodes.length;j++) {
            if(_array_index(transform.whitelist_nodes[j], this.whitelist_nodes) === -1) {
              this.whitelist_nodes.push(transform.whitelist_nodes[j]);
            }
          }
        }
        output.whitelist = transform.whitelist ? true : false;
        if(transform.attr_whitelist) {
          output.attr_whitelist = _merge_arrays_uniq(output.attr_whitelist, transform.attr_whitelist);
        }
        output.node = transform.node ? transform.node : output.node;
      }
      else {
        throw new Error('transformer output must be an object or null');
      }
    }
    return output;
  }

  for(var i=0;i<container.childNodes.length;i++) {
    _clean.call(this, container.childNodes[i]);
  }

  if(fragment.normalize) {
    fragment.normalize();
  }

  return fragment;

};

module.exports = Sanitize;
