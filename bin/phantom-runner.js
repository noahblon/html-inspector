var system = require('system')
  , page = require('webpage').create()

// Safe to assume arguments here
var basePath = system.args[1]
  , inspectLocation = system.args[2]
  , configFile = system.args[3]

page.onCallback = function(data) {
  if (data && data.sender && data.sender == "HTMLInspector") {
    console.log(data.message)
  }
}

page.onClosing = function() {
  phantom.exit()
}

page.onError = function(msg) {
  console.error(msg)
  phantom.exit()
}

page.onLoadFinished = function(status) {

  if(status !== 'success') {
    system.stdout.write('Unable to open location "' + inspectLocation + '"')
    phantom.exit()
  }

  var hasInspectorScript = page.evaluate(function() {
    return window.HTMLInspector
  })

  if (!hasInspectorScript) {
    page.injectJs(basePath + '/html-inspector.js')
  }

  page.evaluate(function() {
    HTMLInspector.defaults.onComplete = function(errors) {
      window.callPhantom({
        sender: "HTMLInspector",
        message: errors.map(function(error) {
          return "[" + error.rule + "] " + error.message
        }).join("\n")
      })
      window.close()
    }
  })

  if (configFile) {
    page.injectJs(configFile)
  } else {
    page.evaluate(function() {
      HTMLInspector.inspect()
    })
  }
}

page.open(inspectLocation)
