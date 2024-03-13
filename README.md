Ligature
========

Ligature is a WYSIWYG & Plaintext `contenteditable` text editor with 3 core values:

- Provide a simple interface, showing tools within the context of the writing process.
- Sections of text and media are structured in un-nested blocks.
- Flexible and robust API for integration into a wide range of text editing platforms.

## Setup & Build

Development dependencies are loaded using **npm**. To integrate into a project with **browserify**, build from source using the `src/ligature.js` file as the entry point.

#### Steps to get developing:

1. `npm install` to get dev dependencies
2. `npm run watch` (live updates) OR `npm run build` to build the distribution file
3. `npm run docs` after making code changes to update the documentation
4. The Ligature JS and CSS will be built to the `dist` folder, which are used in the demo.

#### To create a new release:

1. Merge your branch into master
2. Update the `package.json` file with a new version, using the [Semantic Versioning](http://semver.org) guidelines.
3. Create a new release in GitHub, with the _same_ version number used in step 2.

If you're including Ligature in another project, you can now update the version number there, and run `npm update ligature` to fetch the new version.

## Usage

**TODO:** Add additional config options here!

    var config = {
        placeholder: 'Enter text here...',
        characterLimit: null,
        onChange: function() {
            console.log('Rich Text Changed to: ' + this.getData());
        },
        onSelection: function(selection) { },
        onClientEvent: function(e) { },
        pasteHook: function(clipboardData, shiftKey) { },
        onImageAdded: function(imgElement, file) { },
        flattenBlocks: true,
        runIFrameSanitization: false,
        filterForSetData: function(html) { return html; },
        filterForGetData: function(html) { return html; },
        filterRules: {
            elements: [ 'a', 'b', 'i', 'strike' ], // only allow these
            attributes: { // only allow these
                a: ['href', 'title'],
                img: ['src', 'alt', 'data-img-key', 'data-orig-width', 'data-orig-height']
            },
            protocols: {
                a: false, // this disables the default protocol filtering
                iframe: { src: [ 'https://', 'http://', '//' ] } // only allow these
            }
        }
    };

    var editableElement = $('[contenteditable]').get(0);

    var richTextInstance = new Ligature.RichTextEditor(editableElement, config);

*See the [demo.js](demo.js) file for more examples of use.*

## Styling

All styles are in `editor.css`, including mapping of icon font characters. The `demo.html` includes two external style sheets:

1. [Normalize.css](http://necolas.github.io/normalize.css/)
2. [Font Awesome](http://fontawesome.io)

These are not required, and are used as a base line / icon font for the interface. By modifying the `editor.css` file, any type of skin or styles can be created for the editor. Some generic styles are added to the editor controls for styling - do be aware that if you integrate the editor into a site that already has styles for these classes, there could be styling conflicts if not scoped appropriately.

## Documentation

Docker is used to auto generate the documentation of all code comments.
