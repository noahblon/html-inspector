var reClassSelector = /\.[a-z0-9_\-]+/ig
  , toArray = require("mout/lang/toArray")
  , unique = require("mout/array/unique")
  , matches = require("dom-utils/lib/matches")
  , isCrossOrigin = require("../utils/cross-origin")

/**
 * Get an array of class selectors from a CSSRuleList object
 */
function getClassesFromRuleList(rulelist) {
  return rulelist.reduce(function(classes, rule) {
    var matches
    if (rule.styleSheet) { // from @import rules
      return classes.concat(getClassesFromStyleSheets([rule.styleSheet]))
    }
    else if (rule.cssRules) { // from @media rules (or other conditionals)
      return classes.concat(getClassesFromRuleList(toArray(rule.cssRules)))
    }
    else if (rule.selectorText) {
      matches = rule.selectorText.match(reClassSelector) || []
      return classes.concat(matches.map(function(cls) { return cls.slice(1) } ))
    }
    return classes
  }, [])
}

/**
 * Get an array of class selectors from a CSSSytleSheetList object
 */
function getClassesFromStyleSheets(styleSheets) {
  return styleSheets.reduce(function(classes, sheet) {
    // cross origin stylesheets don't expose their cssRules property
    return sheet.href && isCrossOrigin(sheet.href)
      ? classes
      : classes.concat(getClassesFromRuleList(toArray(sheet.cssRules)))
  }, [])
}

function getStyleSheets() {
  return toArray(document.styleSheets).filter(function(sheet) {
    return matches(sheet.ownerNode, css.styleSheets)
  })
}

var css = {
  getClassSelectors: function() {
    return unique(getClassesFromStyleSheets(getStyleSheets()))
  },
  // getSelectors: function() {
  //   return []
  // },
  styleSheets: 'link[rel="stylesheet"], style'
}

module.exports = {
  name: "css",
  module: css
}
