/*
    ## Ligature Demo
    Example of instantiating Ligature and accessing the public methods.
*/
(function() {
    var $ = window.jQuery;

    window.Ligature.debugMode = true;

    /**
     * ### Create Editor Instance
     *
     * Initialize our editor with an element that is "content editable".
     * Pass in a config that:
     *
     * - Sets placeholder text
     * - Logs data on change
     * - Defines uploading function
     */
    window.demoEditorRich = new window.Ligature.RichTextEditor(
        $('#demo-editor-rich').get(0),
        {
            labels: {}, // Labels for strings that need translating; currently used in the link editor
            placeholder: 'Put something here!',
            runIFrameSanitization: true,
            onChange: function(e) {
            },
            onSelection: function(selection) {
            },
            onClientEvent: function(e) {
            },
            pasteHook: function(clipboardData, shiftKey) {
            },
            blurHook: function(e, defaultOnBlur) {
                if(e.relatedTarget && e.relatedTarget.nodeName === 'BUTTON') {
                    $(e.relatedTarget).on('mouseup', defaultOnBlur);
                    return true;
                }
            },
            onAsyncImageAdded: function(key, source, file, attributes) {
                console.log('Image Added: ');
                console.log(key, source, file, attributes);
            },
            addImgAttrs: {
                toImg: true,
                toImgParent: false
            },
            onFileAdded: function(file, insertNode, direction) {
                var mimeType = file.type;
                if(!/^image[/]\w*$/.test(mimeType)) {
                    console.warn('Sorry, you may only add image files to the editor.');
                    return;
                }
                console.log('File added of type ' + file.type);
                window.demoEditorRich.insertAsyncImage(null, file, insertNode, direction, true);
            },
            inlineControlsConfig: {
                onTrayOpened: function(intentTriggered) {
                    if (intentTriggered) {
                        console.log('User opened the inline controls tray.');
                    }
                },
                onTrayClosed: function(intentTriggered) {
                    if (intentTriggered) {
                        console.log('User closed the inline controls tray.');
                    }
                }
            },
            flattenBlocks: true,
            smartQuotes: {
                enabled: true
            }
        }
    );

    window.demoEditorPlain = new window.Ligature.PlainTextEditor(
        $('#demo-editor-plain').get(0),
        {
            placeholder: 'Hi, I\'m plaintext!',
            onChange: function(e) {
                console.log('Plain Text Changed to: ' + this.getData());
            },
            forceSingleLine: false,
            smartQuotes: {
                enabled: true
            }
        }
    );

    // Demo controls
    $('#normal').click(function() {
        window.demoEditorRich.setData($('#example').html(), true, false);
    });

    $('#flat').click(function() {
        window.demoEditorRich.setData($('#example').html(), true, true);
    });

    /**
     * ### Add Controls
     *
     * Adds an image uploader button to the editor wrapper.
     *
     * NOTE: _This is currently for demo purposes - the actual implementation
     * would handle actual file uploads._
     */
    (function addControls() {

        // IMAGE Button
        var imgButton = $('<div />', { 'class': 'control add-image'});
        var fileUploader = $('<input />', {
            'type': 'file',
            'accept': 'image/*'
        });
        imgButton.append(fileUploader);
        imgButton.click(function() {
            window.demoEditorRich.staticControls.hide();
        });

        // When we've added a file, insert it to editor
        fileUploader.on('change',function(e) {
            var file = e.target.files[0];

            window.demoEditorRich.insertAsyncImage(null, file);

            $(this).val(''); // Clear file uploader

            window.demoEditorRich.inlineControls.close();

            //TODO: Trigger upload, then swap out src for image when it's done
            //      Possibly use the file ID from file API to file img to update
        });

        window.demoEditorRich.inlineControls.addToTray(imgButton);

        // HR Button
        var hrButton = $('<div />', { 'class': 'control add-hr'});

        var addHr = function () {
            if (! window.demoEditorRich.hasSelection()) {
                window.demoEditorRich.insertMedia('<hr>');
            }
        };

        hrButton.on('click', addHr);
        hrButton.on('mousedown', function(e) {
            e.stopPropagation();
            e.preventDefault();
            return false;
        });
        window.demoEditorRich.inlineControls.addToTray(hrButton, {
            keyboard: {
                shortcut: 'meta+shift+space',
                callback: addHr
            }
        });
        var readMoreButton = $('<div />', { 'class': 'control add-read-more'});
        readMoreButton.on('click', function(e) {
            window.demoEditorRich.insertMedia('<hr class="read-more" data-label="Read More &rarr;">');
            return false;
        });
        readMoreButton.on('mousedown', function(e) {
            e.stopPropagation();
            e.preventDefault();
            return false;
        });
        window.demoEditorRich.inlineControls.addToTray(readMoreButton);

    })();

})();

