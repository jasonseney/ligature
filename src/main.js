/**
* # Main
*
* A set of components to build a contextual editor.
*
* Expose public modules including:
*
* - RichTextEditor (WYSIWYG Content Editable)
* - PlainTextEditor (Content Editable instance that generates to plaintext linebreaksl and output)
* - Additional modules to be used for general purpose outside the editors.
*
*/
var _ = require('lodash');
var Ligature = require('./ligature');

module.exports = _.extend(Ligature, {
    RichTextEditor : require('./richTextEditor'),
    PlainTextEditor : require('./plainTextEditor'),
    SelectionContext: require('./selectionContext'),
    SelectionPersistence: require('./selectionPersistence'),
    Utils: require('./utils'),
    HumanKeys: require('./humanKeys')
});
