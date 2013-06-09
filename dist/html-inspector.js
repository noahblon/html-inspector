/*!
 * HTML Inspector - v0.1.0
 *
 * Copyright (c) 2013 Philip Walton <http://philipwalton.com>
 * Released under the MIT license
 *
 * Date: 2013-06-09
 */
;(function(root, $, document) {

function toArray(arrayLike) {
  return arrayLike ? [].slice.call(arrayLike) : []
}


/**
 * Determine if an object is a Regular Expression
 */
function isRegExp(obj) {
  return Object.prototype.toString.call(obj) == "[object RegExp]"
}


/**
 * Consume an array and return a new array with no duplicate values
 */
function unique(array) {
  var uniq = []
  array = array.sort()
  array.forEach(function(val, i) {
    val !== array[i-1] && uniq.push(val)
  })
  return uniq
}


/**
 * Given a string and a list of strings or Regular Expressions,
 * does the string match any of the items in the list?
 */
function foundIn(needle, haystack) {
  return haystack.some(function(item) {
    return isRegExp(item) ? item.test(needle) : needle === item
  })
}

function Listener() {
  this._events = {}
}

Listener.prototype.on = function(event, fn) {
  this._events[event] || (this._events[event] = $.Callbacks())
  this._events[event].add(fn)
}

Listener.prototype.off = function(event, fn) {
  this._events[event] && this._events[event].remove(fn)
}

Listener.prototype.trigger = function(event, context, args) {
  this._events[event] && this._events[event].fireWith(context, args)
}

function Reporter() {
  this._errors = []
}

Reporter.prototype.warn = function(rule, message, context) {
  this._errors.push({
    rule: rule,
    message: message,
    context: context
  })
}

Reporter.prototype.getWarnings = function() {
  return this._errors
}

function Rules() {}

Rules.prototype.add = function(name, config, fn) {
  if (typeof config == "function") {
    fn = config
    config = {}
  }
  this[name] = {
    name: name,
    config: config,
    fn: fn
  }
}

Rules.prototype.extend = function(name, options) {
  if (typeof options == "function")
    options = options.call(this[name].config, this[name].config)
  $.extend(this[name].config, options)
}

function Modules() {}

Modules.prototype.add = function(name, module) {
  this[name] = module
}

Modules.prototype.extend = function(name, options) {
  if (typeof options == "function")
    options = options.call(this[name], this[name])
  $.extend(this[name], options)
}

var HTMLInspector = (function() {

  /**
   * Set (or reset) all data back to its original value
   * and initialize the specified rules
   */
  function setup(useRules, listener, reporter) {
    useRules = useRules == null
      ? Object.keys(inspector.rules)
      : useRules
    useRules.forEach(function(rule) {
      if (inspector.rules[rule]) {
        inspector.rules[rule].fn.call(
          inspector.rules[rule].config,
          listener,
          reporter,
          inspector.rules[rule].config
        )
      }
    })
  }

  function traverseDOM(root, listener) {
    var $root = $(root)
      , $dom = $root.add($root.find("*"))
    listener.trigger("beforeInspect", inspector.config.domRoot)
    $dom.each(function() {
      var el = this
      listener.trigger("element", el, [el.nodeName.toLowerCase(), el])
      if (el.id) {
        listener.trigger("id", el, [el.id, el])
      }
      toArray(el.classList).forEach(function(name) {
        listener.trigger("class", el, [name, el])
      })
      toArray(el.attributes).forEach(function(attr) {
        listener.trigger("attribute", el, [attr.name, attr.value, el])
      })
    })
    listener.trigger("afterInspect", inspector.config.domRoot)
  }

  function processConfig(config) {
    // allow config to be individual properties of the defaults object
    if (config) {
      if (typeof config == "string"
        || config.nodeType == 1
        || config instanceof $)
      {
        config = { domRoot: config }
      } else if (Array.isArray(config)) {
        config = { useRules: config }
      } else if (typeof config == "function") {
        config = { onComplete: config }
      }
    }
    // merge config with the defaults
    return $.extend({}, inspector.config, config)
  }

  var inspector = {

    config: {
      useRules: null,
      domRoot: "html",
      onComplete: function(errors) {
        errors.forEach(function(error) {
          console.warn(error.message, error.context)
        })
      }
    },

    rules: new Rules(),

    modules: new Modules(),

    inspect: function(config) {
      var listener = new Listener()
        , reporter = new Reporter()
      config = processConfig(config)
      setup(config.useRules, listener, reporter)
      traverseDOM(config.domRoot, listener)
      config.onComplete(reporter.getWarnings())
    }

  }

  return inspector

}())

HTMLInspector.modules.add("css", (function() {

  var reClassSelector = /\.[a-z0-9_\-]+/ig

  /**
   * Get an array of class selectors from a CSSRuleList object
   */
  function getClassesFromRuleList(rulelist) {
    return rulelist.reduce(function(classes, rule) {
      var matches
      if (rule.cssRules) {
        return classes.concat(getClassesFromRuleList(toArray(rule.cssRules)))
      }
      if (rule.selectorText) {
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
      return classes.concat(getClassesFromRuleList(toArray(sheet.cssRules)))
    }, [])
  }

  function getStyleSheets() {
    return toArray(document.styleSheets).filter(function(sheet) {
      return $(sheet.ownerNode).is(css.styleSheets)
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

  return css

}()))

HTMLInspector.modules.add("validation", function() {

  // ============================================================
  // A data map of all valid HTML elements, their attributes
  // and what type of children they may contain
  //
  // http://drafts.htmlwg.org/html/master/iana.html#index
  // ============================================================

  var elementData = {
    "a": {
      children: "transparent*",
      attributes: "globals; href; target; download; rel; hreflang; type"
    },
    "abbr": {
      children: "phrasing",
      attributes: "globals"
    },
    "address": {
      children: "flow*",
      attributes: "globals"
    },
    "area": {
      children: "empty",
      attributes: "globals; alt; coords; shape; href; target; download; rel; hreflang; type"
    },
    "article": {
      children: "flow",
      attributes: "globals"
    },
    "aside": {
      children: "flow",
      attributes: "globals"
    },
    "audio": {
      children: "source*; transparent*",
      attributes: "globals; src; crossorigin; preload; autoplay; mediagroup; loop; muted; controls"
    },
    "b": {
      children: "phrasing",
      attributes: "globals"
    },
    "base": {
      children: "empty",
      attributes: "globals; href; target"
    },
    "bdi": {
      children: "phrasing",
      attributes: "globals"
    },
    "bdo": {
      children: "phrasing",
      attributes: "globals"
    },
    "blockquote": {
      children: "flow",
      attributes: "globals; cite"
    },
    "body": {
      children: "flow",
      attributes: "globals; onafterprint; onbeforeprint; onbeforeunload; onfullscreenchange; onfullscreenerror; onhashchange; onmessage; onoffline; ononline; onpagehide; onpageshow; onpopstate; onresize; onstorage; onunload"
    },
    "br": {
      children: "empty",
      attributes: "globals"
    },
    "button": {
      children: "phrasing*",
      attributes: "globals; autofocus; disabled; form; formaction; formenctype; formmethod; formnovalidate; formtarget; name; type; value"
    },
    "canvas": {
      children: "transparent",
      attributes: "globals; width; height"
    },
    "caption": {
      children: "flow*",
      attributes: "globals"
    },
    "cite": {
      children: "phrasing",
      attributes: "globals"
    },
    "code": {
      children: "phrasing",
      attributes: "globals"
    },
    "col": {
      children: "empty",
      attributes: "globals; span"
    },
    "colgroup": {
      children: "col",
      attributes: "globals; span"
    },
    "menuitem": {
      children: "empty",
      attributes: "globals; type; label; icon; disabled; checked; radiogroup; command"
    },
    "data": {
      children: "phrasing",
      attributes: "globals; value"
    },
    "datalist": {
      children: "phrasing; option",
      attributes: "globals"
    },
    "dd": {
      children: "flow",
      attributes: "globals"
    },
    "del": {
      children: "transparent",
      attributes: "globals; cite; datetime"
    },
    "details": {
      children: "summary*; flow",
      attributes: "globals; open"
    },
    "dfn": {
      children: "phrasing*",
      attributes: "globals"
    },
    "dialog": {
      children: "flow",
      attributes: "globals; open"
    },
    "div": {
      children: "flow",
      attributes: "globals"
    },
    "dl": {
      children: "dt*; dd*",
      attributes: "globals"
    },
    "dt": {
      children: "flow*",
      attributes: "globals"
    },
    "em": {
      children: "phrasing",
      attributes: "globals"
    },
    "embed": {
      children: "empty",
      attributes: "globals; src; type; width; height; any*"
    },
    "fieldset": {
      children: "legend*; flow",
      attributes: "globals; disabled; form; name"
    },
    "figcaption": {
      children: "flow",
      attributes: "globals"
    },
    "figure": {
      children: "figcaption*; flow",
      attributes: "globals"
    },
    "footer": {
      children: "flow*",
      attributes: "globals"
    },
    "form": {
      children: "flow*",
      attributes: "globals; accept-charset; action; autocomplete; enctype; method; name; novalidate; target"
    },
    "h1": {
      children: "phrasing",
      attributes: "globals"
    },
    "h2": {
      children: "phrasing",
      attributes: "globals"
    },
    "h3": {
      children: "phrasing",
      attributes: "globals"
    },
    "h4": {
      children: "phrasing",
      attributes: "globals"
    },
    "h5": {
      children: "phrasing",
      attributes: "globals"
    },
    "h6": {
      children: "phrasing",
      attributes: "globals"
    },
    "head": {
      children: "metadata content*",
      attributes: "globals"
    },
    "header": {
      children: "flow*",
      attributes: "globals"
    },
    "hr": {
      children: "empty",
      attributes: "globals"
    },
    "html": {
      children: "head*; body*",
      attributes: "globals; manifest"
    },
    "i": {
      children: "phrasing",
      attributes: "globals"
    },
    "iframe": {
      children: "text*",
      attributes: "globals; src; srcdoc; name; sandbox; seamless; allowfullscreen; width; height"
    },
    "img": {
      children: "empty",
      attributes: "globals; alt; src; crossorigin; usemap; ismap; width; height"
    },
    "input": {
      children: "empty",
      attributes: "globals; accept; alt; autocomplete; autofocus; checked; dirname; disabled; form; formaction; formenctype; formmethod; formnovalidate; formtarget; height; list; max; maxlength; min; multiple; name; pattern; placeholder; readonly; required; size; src; step; type; value; width"
    },
    "ins": {
      children: "transparent",
      attributes: "globals; cite; datetime"
    },
    "kbd": {
      children: "phrasing",
      attributes: "globals"
    },
    "keygen": {
      children: "empty",
      attributes: "globals; autofocus; challenge; disabled; form; keytype; name"
    },
    "label": {
      children: "phrasing*",
      attributes: "globals; form; for"
    },
    "legend": {
      children: "phrasing",
      attributes: "globals"
    },
    "li": {
      children: "flow",
      attributes: "globals; value*"
    },
    "link": {
      children: "empty",
      attributes: "globals; href; crossorigin; rel; media; hreflang; type; sizes"
    },
    "main": {
      children: "flow*",
      attributes: "globals"
    },
    "map": {
      children: "transparent; area*",
      attributes: "globals; name"
    },
    "mark": {
      children: "phrasing",
      attributes: "globals"
    },
    "menu": {
      children: "li*; flow*; menuitem*; hr*; menu*",
      attributes: "globals; type; label"
    },
    "meta": {
      children: "empty",
      attributes: "globals; name; http-equiv; content; charset"
    },
    "meter": {
      children: "phrasing*",
      attributes: "globals; value; min; max; low; high; optimum"
    },
    "nav": {
      children: "flow",
      attributes: "globals"
    },
    "noscript": {
      children: "varies*",
      attributes: "globals"
    },
    "object": {
      children: "param*; transparent",
      attributes: "globals; data; type; typemustmatch; name; usemap; form; width; height"
    },
    "ol": {
      children: "li",
      attributes: "globals; reversed; start type"
    },
    "optgroup": {
      children: "option",
      attributes: "globals; disabled; label"
    },
    "option": {
      children: "text*",
      attributes: "globals; disabled; label; selected; value"
    },
    "output": {
      children: "phrasing",
      attributes: "globals; for; form; name"
    },
    "p": {
      children: "phrasing",
      attributes: "globals"
    },
    "param": {
      children: "empty",
      attributes: "globals; name; value"
    },
    "pre": {
      children: "phrasing",
      attributes: "globals"
    },
    "progress": {
      children: "phrasing*",
      attributes: "globals; value; max"
    },
    "q": {
      children: "phrasing",
      attributes: "globals; cite"
    },
    "rp": {
      children: "phrasing",
      attributes: "globals"
    },
    "rt": {
      children: "phrasing",
      attributes: "globals"
    },
    "ruby": {
      children: "phrasing; rt; rp*",
      attributes: "globals"
    },
    "s": {
      children: "phrasing",
      attributes: "globals"
    },
    "samp": {
      children: "phrasing",
      attributes: "globals"
    },
    "script": {
      children: "script, data, or script documentation*",
      attributes: "globals; src; type; charset; async; defer; crossorigin"
    },
    "section": {
      children: "flow",
      attributes: "globals"
    },
    "select": {
      children: "option, optgroup",
      attributes: "globals; autofocus; disabled; form; multiple; name; required; size"
    },
    "small": {
      children: "phrasing",
      attributes: "globals"
    },
    "source": {
      children: "empty",
      attributes: "globals; src; type; media"
    },
    "span": {
      children: "phrasing",
      attributes: "globals"
    },
    "strong": {
      children: "phrasing",
      attributes: "globals"
    },
    "style": {
      children: "varies*",
      attributes: "globals; media; type; scoped"
    },
    "sub": {
      children: "phrasing",
      attributes: "globals"
    },
    "summary": {
      children: "phrasing",
      attributes: "globals"
    },
    "sup": {
      children: "phrasing",
      attributes: "globals"
    },
    "table": {
      children: "caption*; colgroup*; thead*; tbody*; tfoot*; tr*",
      attributes: "globals; border"
    },
    "tbody": {
      children: "tr",
      attributes: "globals"
    },
    "td": {
      children: "flow",
      attributes: "globals; colspan; rowspan; headers"
    },
    "textarea": {
      children: "text",
      attributes: "globals; autofocus; cols; dirname; disabled; form; maxlength; name; placeholder; readonly; required; rows; wrap"
    },
    "tfoot": {
      children: "tr",
      attributes: "globals"
    },
    "th": {
      children: "flow*",
      attributes: "globals; colspan; rowspan; headers; scope; abbr"
    },
    "thead": {
      children: "tr",
      attributes: "globals"
    },
    "time": {
      children: "phrasing",
      attributes: "globals; datetime"
    },
    "title": {
      children: "text*",
      attributes: "globals"
    },
    "tr": {
      children: "th*; td",
      attributes: "globals"
    },
    "track": {
      children: "empty",
      attributes: "globals; default; kind; label; src; srclang"
    },
    "u": {
      children: "phrasing",
      attributes: "globals"
    },
    "ul": {
      children: "li",
      attributes: "globals"
    },
    "var": {
      children: "phrasing",
      attributes: "globals"
    },
    "video": {
      children: "source*; transparent*",
      attributes: "globals; src; crossorigin; poster; preload; autoplay; mediagroup; loop; muted; controls; width; height"
    },
    "wbr": {
      children: "empty",
      attributes: "globals"
    }
  }

  // ============================================================
  // Element categories and the elements tht are in those
  // categories. Elements may be in more than one category
  //
  // http://drafts.htmlwg.org/html/master/iana.html#element-content-categories
  // ============================================================

  var elementCategories = {
    "metadata": "base; link; meta; noscript; script; style; title",
    "flow": "a; abbr; address; article; aside; audio; b; bdi; bdo; blockquote; br; button; canvas; cite; code; data; datalist; del; details; dfn; dialog; div; dl; em; embed; fieldset; figure; footer; form; h1; h2; h3; h4; h5; h6; header; hr; i; iframe; img; input; ins; kbd; keygen; label; main; map; mark; math; menu; meter; nav; noscript; object; ol; output; p; pre; progress; q; ruby; s; samp; script; section; select; small; span; strong; sub; sup; svg; table; textarea; time; u; ul; var; video; wbr; Text",
    "sectioning": "article; aside; nav; section",
    "heading": "h1; h2; h3; h4; h5; h6;",
    "phrasing": "a; abbr; audio; b; bdi; bdo; br; button; canvas; cite; code; data; datalist; del; dfn; em; embed; i; iframe; img; input; ins; kbd; keygen; label; map; mark; math; meter; noscript; object; output; progress; q; ruby; s; samp; script; select; small; span; strong; sub; sup; svg; textarea; time; u; var; video; wbr; Text",
    "embedded": "audio canvas embed iframe img math object svg video",
    "interactive": "a; button; details; embed; iframe; keygen; label; select; textarea;",
    "sectioning roots": "blockquote; body; details; dialog; fieldset; figure; td",
    "form-associated": "button; fieldset; input; keygen; label; object; output; select; textarea",
    "listed": "button; fieldset; input; keygen; object; output; select; textarea",
    "submittable": "button; input; keygen; object; select; textarea",
    "resettable": "input; keygen; output; select; textarea",
    "labelable": "button; input; keygen; meter; output; progress; select; textarea",
    "palpable": "a; abbr; address; article; aside; b; bdi; bdo; blockquote; button; canvas; cite; code; data; details; dfn; div; em; embed; fieldset; figure; footer; form; h1; h2; h3; h4; h5; h6; header; i; iframe; img; ins; kbd; keygen; label; map; mark; math; meter; nav; object; output; p; pre; progress; q; ruby; s; samp; section; select; small; span; strong; sub; sup; svg; table; textarea; time; u; var; video"
  }

  // ============================================================
  // Attributes that may be used on any valid HTML element
  //
  // http://drafts.htmlwg.org/html/master/dom.html#global-attributes
  // ============================================================

  var globalAttributes = [
    // primary
    "accesskey",
    "class",
    "contenteditable",
    "contextmenu",
    "dir",
    "draggable",
    "dropzone",
    "hidden",
    "id",
    "inert",
    "itemid",
    "itemprop",
    "itemref",
    "itemscope",
    "itemtype",
    "lang",
    "spellcheck",
    "style",
    "tabindex",
    "title",
    "translate",
    // additional
    "role",
    /aria-[a-z\-]+/,
    /data-[a-z\-]+/,
    /on[a-z\-]+/
  ]

  // ============================================================
  // HTML elements that are obsolete and no longer allowed
  //
  // http://drafts.htmlwg.org/html/master/obsolete.html#obsolete
  // ============================================================

  var obsoluteElements = [
    "applet",
    "acronym",
    "bgsound",
    "dir",
    "frame",
    "frameset",
    "noframes",
    "hgroup",
    "isindex",
    "listing",
    "nextid",
    "noembed",
    "plaintext",
    "rb",
    "strike",
    "xmp",
    "basefont",
    "big",
    "blink",
    "center",
    "font",
    "marquee",
    "multicol",
    "nobr",
    "spacer",
    "tt"
  ]

  // ============================================================
  // Attributes that are obsolete on certain elements
  //
  // http://drafts.htmlwg.org/html/master/obsolete.html#obsolete
  // ============================================================

  var obsoleteAttributes = [
    { attribute: "charset", elements: "a" },
    { attribute: "charset", elements: "link" },
    { attribute: "coords", elements: "a" },
    { attribute: "shape", elements: "a" },
    { attribute: "methods", elements: "a" },
    { attribute: "methods", elements: "link" },
    { attribute: "name", elements: "a" },
    { attribute: "name", elements: "embed" },
    { attribute: "name", elements: "img" },
    { attribute: "name", elements: "option" },
    { attribute: "rev", elements: "a" },
    { attribute: "rev", elements: "link" },
    { attribute: "urn", elements: "a" },
    { attribute: "urn", elements: "link" },
    { attribute: "accept", elements: "form" },
    { attribute: "nohref", elements: "area" },
    { attribute: "profile", elements: "head" },
    { attribute: "version", elements: "html" },
    { attribute: "ismap", elements: "input" },
    { attribute: "usemap", elements: "input" },
    { attribute: "longdesc", elements: "iframe" },
    { attribute: "longdesc", elements: "img" },
    { attribute: "lowsrc", elements: "img" },
    { attribute: "target", elements: "link" },
    { attribute: "scheme", elements: "meta" },
    { attribute: "archive", elements: "object" },
    { attribute: "classid", elements: "object" },
    { attribute: "code", elements: "object" },
    { attribute: "codebase", elements: "object" },
    { attribute: "codetype", elements: "object" },
    { attribute: "declare", elements: "object" },
    { attribute: "standby", elements: "object" },
    { attribute: "type", elements: "param" },
    { attribute: "valuetype", elements: "param" },
    { attribute: "language", elements: "script" },
    { attribute: "event", elements: "script" },
    { attribute: "for", elements: "script" },
    { attribute: "datapagesize", elements: "table" },
    { attribute: "summary", elements: "table" },
    { attribute: "axis", elements: "td; th" },
    { attribute: "scope", elements: "td" },
    { attribute: "datasrc", elements: "a; applet; button; div; frame; iframe; img; input; label; legend; marquee; object; option; select; span; table; textarea" },
    { attribute: "datafld", elements: "a; applet; button; div; fieldset; frame; iframe; img; input; label; legend; marquee; object; param; select; span; textarea" },
    { attribute: "dataformatas", elements: "button; div; input; label; legend; marquee; object; option; select; span; table" },
    { attribute: "alink", elements: "body" },
    { attribute: "bgcolor", elements: "body" },
    { attribute: "link", elements: "body" },
    { attribute: "marginbottom", elements: "body" },
    { attribute: "marginheight", elements: "body" },
    { attribute: "marginleft", elements: "body" },
    { attribute: "marginright", elements: "body" },
    { attribute: "margintop", elements: "body" },
    { attribute: "marginwidth", elements: "body" },
    { attribute: "text", elements: "body" },
    { attribute: "vlink", elements: "body" },
    { attribute: "clear", elements: "br" },
    { attribute: "align", elements: "caption" },
    { attribute: "align", elements: "col" },
    { attribute: "char", elements: "col" },
    { attribute: "charoff", elements: "col" },
    { attribute: "valign", elements: "col" },
    { attribute: "width", elements: "col" },
    { attribute: "align", elements: "div" },
    { attribute: "compact", elements: "dl" },
    { attribute: "align", elements: "embed" },
    { attribute: "hspace", elements: "embed" },
    { attribute: "vspace", elements: "embed" },
    { attribute: "align", elements: "hr" },
    { attribute: "color", elements: "hr" },
    { attribute: "noshade", elements: "hr" },
    { attribute: "size", elements: "hr" },
    { attribute: "width", elements: "hr" },
    { attribute: "align", elements: "h1; h2; h3; h4; h5; h6" },
    { attribute: "align", elements: "iframe" },
    { attribute: "allowtransparency", elements: "iframe" },
    { attribute: "frameborder", elements: "iframe" },
    { attribute: "hspace", elements: "iframe" },
    { attribute: "marginheight", elements: "iframe" },
    { attribute: "marginwidth", elements: "iframe" },
    { attribute: "scrolling", elements: "iframe" },
    { attribute: "vspace", elements: "iframe" },
    { attribute: "align", elements: "input" },
    { attribute: "hspace", elements: "input" },
    { attribute: "vspace", elements: "input" },
    { attribute: "align", elements: "img" },
    { attribute: "border", elements: "img" },
    { attribute: "hspace", elements: "img" },
    { attribute: "vspace", elements: "img" },
    { attribute: "align", elements: "legend" },
    { attribute: "type", elements: "li" },
    { attribute: "compact", elements: "menu" },
    { attribute: "align", elements: "object" },
    { attribute: "border", elements: "object" },
    { attribute: "hspace", elements: "object" },
    { attribute: "vspace", elements: "object" },
    { attribute: "compact", elements: "ol" },
    { attribute: "align", elements: "p" },
    { attribute: "width", elements: "pre" },
    { attribute: "align", elements: "table" },
    { attribute: "bgcolor", elements: "table" },
    { attribute: "cellpadding", elements: "table" },
    { attribute: "cellspacing", elements: "table" },
    { attribute: "frame", elements: "table" },
    { attribute: "rules", elements: "table" },
    { attribute: "width", elements: "table" },
    { attribute: "align", elements: "tbody; thead; tfoot" },
    { attribute: "char", elements: "tbody; thead; tfoot" },
    { attribute: "charoff", elements: "tbody; thead; tfoot" },
    { attribute: "valign", elements: "tbody; thead; tfoot" },
    { attribute: "align", elements: "td; th" },
    { attribute: "bgcolor", elements: "td; th" },
    { attribute: "char", elements: "td; th" },
    { attribute: "charoff", elements: "td; th" },
    { attribute: "height", elements: "td; th" },
    { attribute: "nowrap", elements: "td; th" },
    { attribute: "valign", elements: "td; th" },
    { attribute: "width", elements: "td; th" },
    { attribute: "align", elements: "tr" },
    { attribute: "bgcolor", elements: "tr" },
    { attribute: "char", elements: "tr" },
    { attribute: "charoff", elements: "tr" },
    { attribute: "valign", elements: "tr" },
    { attribute: "compact", elements: "ul" },
    { attribute: "type", elements: "ul" },
    { attribute: "background", elements: "body; table; thead; tbody; tfoot; tr; td; th" }
  ]

  // ============================================================
  // Attributes that are required to be on particular elements
  //
  // http://www.w3.org/TR/html4/index/attributes.html
  // http://www.w3.org/TR/html5-diff/#changed-attributes
  //
  // TODO: find a better, more comprehensive source for this
  // ============================================================

  var requiredAttributes = [
    { attributes: ["alt"], element: "area" },
    { attributes: ["height", "width"], element: "applet" },
    { attributes: ["dir"], element: "bdo" },
    { attributes: ["action"], element: "form" },
    { attributes: ["alt", "src"], element: "img" },
    { attributes: ["name"], element: "map" },
    { attributes: ["label"], element: "optgroup" },
    { attributes: ["name"], element: "param" },
    { attributes: ["cols", "rows"], element: "textarea" }
  ]

  // ============================================================
  // A complete list of valid elements in HTML. This is
  // programatically generated form the elementData variable
  // ============================================================

  var elements = Object.keys(elementData).sort()

  // TODO: memoize these functions

  function elementName(element) {
    if (typeof element == "string")
      return element
    if (element.nodeType)
      return element.nodeName.toLowerCase()
  }

  function allowedAttributesForElement(element) {
    return elementData[element].attributes.replace(/\*/g, "").split(/\s*;\s*/)
  }

  //
  // WARNING: There are issues with this, do not use!
  //
  // function allowedChildrenGivenElementLocation(element) {
  //   var children = elementData[elementName(element)]
  //         .children
  //         .replace(/\*/g, "")
  //         .split(/\s*;\s*/)
  //   return children.reduce(function(list, child) {
  //     // for complicated cases, child may be a function that accepts
  //     // and element and returns a list of acceptable children
  //     if (typeof child === "function") {
  //       return list.concat(child(element))
  //     }
  //     // elements with a content model of "transparent" essentially
  //     // inherit the content model of their parent, so inspect that
  //     else if (child === "transparent" && element.parentNode) {
  //       return list.concat(allowedChildrenForElement(element.parentNode))
  //     }
  //     // if a category is returned, add all elements in that
  //     // cateogry to the list
  //     else if (elementCategories[child]) {
  //       return list.concat(elementsForCategory(child))
  //     }
  //     // if just an element is returned, add it to the list
  //     else if (isElementValid(child)) {
  //       return list.concat([child])
  //     }
  //     // still here? just return the list
  //     return list
  //   }, [])
  // }
  //

  function elementsForCategory(category) {
    return elementCategories[category].split(/\s*;\s*/)
  }

  function isGlobalAttribute(attribute) {
    return foundIn(attribute, globalAttributes)
  }

  function isWhitelistedElement(element) {
    return foundIn(element, spec.elementWhitelist)
  }

  function isWhitelistedAttribute(attribute) {
    return foundIn(attribute, spec.attributeWhitelist)
  }

  var spec = {

    // This allows AngularJS's ng-* attributes to be allowed,
    // customize to fit your needs
    attributeWhitelist: [
      /ng\-[a-z\-]+/
    ],

    // Include any custom element you're using and want to allow
    elementWhitelist: [],

    isElementValid: function(element) {
      return elements.indexOf(element) >= 0
    },

    isElementObsolete: function(element) {
      return obsoluteElements.indexOf(element) >= 0
    },

    isAttributeValidForElement: function(attribute, element) {
      if (isGlobalAttribute(attribute) || isWhitelistedAttribute(attribute)) {
        return true
      }
      // some elements (like embed) accept any attribute
      // http://drafts.htmlwg.org/html/master/embedded-content-0.html#the-embed-element
      if (allowedAttributesForElement(element).indexOf("any") >= 0) return true
      return allowedAttributesForElement(element).indexOf(attribute) >= 0
    },

    isAttributeObsoleteForElement: function(attribute, element) {
      // obsolete element can still be whitelisted
      if (isWhitelistedAttribute(attribute)) return false

      return obsoleteAttributes.some(function(item) {
        if (item.attribute !== attribute) return false
        return item.elements.split(/\s*;\s*/).some(function(name) {
          return name === element
        })
      })
    },

    isAttributeRequiredForElement: function(attribute, element) {
      return requiredAttributes.some(function(item) {
        return element == item.element && item.attributes.indexOf(attribute) >= 0
      })
    },

    getRequiredAttributesForElement: function(element) {
      var filtered = requiredAttributes.filter(function(item) {
        return item.element == element
      })
      return (filtered[0] && filtered[0].attributes) || []
    }

    //
    // WARNING: there are issues with this at the moment, do not use!
    //
    // isElementValidLocation: function(element) {
    //   if (!element.parentNode) return true
    //   var allowedChildren = allowedChildrenGivenElementLocation(element.parentNode)
    //   return allowedChildren.indexOf(elementName(element)) >= 0
    // }

  }

  return spec

}())

;(function() {

  // ============================================================
  // There are several different BEM  naming conventions that
  // I'm aware of. To make things easier, I refer to the
  // methodologies by the name of projects that utilize them.
  //
  // suit: https://github.com/necolas/suit
  // -------------------------------------
  // BlockName
  // BlockName--modifierName
  // BlockName-elementName
  // BlockName-elementName--modifierName
  //
  // inuit: http://inuitcss.com/
  // ---------------------------
  // block-name
  // block-name--modifier-name
  // block-name__element-name
  // block-name__element-name--modifier-name
  //
  // yandex: http://bem.info/
  // ------------------------
  // block-name
  // block-name__elemement-name
  // block-name_modifier_name
  // block-name__element-name_modifier_name
  //
  // ============================================================

  var methodologies = {
    "suit": {
      modifier: /^([A-Z][a-zA-Z]*(?:\-[a-zA-Z]+)?)\-\-[a-zA-Z]+$/,
      element: /^([A-Z][a-zA-Z]*)\-[a-zA-Z]+$/
    },
    "inuit": {
      modifier: /^((?:[a-z]+\-)*[a-z]+(?:__(?:[a-z]+\-)*[a-z]+)?)\-\-(?:[a-z]+\-)*[a-z]+$/,
      element: /^((?:[a-z]+\-)*[a-z]+)__(?:[a-z]+\-)*[a-z]+$/
    },
    "yandex": {
      modifier: /^((?:[a-z]+\-)*[a-z]+(?:__(?:[a-z]+\-)*[a-z]+)?)_(?:[a-z]+_)*[a-z]+$/,
      element: /^((?:[a-z]+\-)*[a-z]+)__(?:[a-z]+\-)*[a-z]+$/
    }
  }

  function getMethodology() {
    if (typeof config.methodology == "string") {
      return methodologies[config.methodology]
    }
    return config.methodology
  }

  var config = {

    methodology: "suit",

    getBlockName: function(elementOrModifier) {
      var block
        , methodology = getMethodology()
      if (methodology.modifier.test(elementOrModifier))
        return block = RegExp.$1
      if (methodology.element.test(elementOrModifier))
        return block = RegExp.$1
      return block || false
    },

    isElement: function(cls) {
      return getMethodology().element.test(cls)
    },

    isModifier: function(cls) {
      return getMethodology().modifier.test(cls)
    }
  }

  HTMLInspector.rules.add(
    "bem-conventions",
    config,
    function(listener, reporter, config) {
      listener.on('class', function(name) {
        if (config.isElement(name)) {
          // check the ancestors for the block class
          if (!$(this).parents().is("." + config.getBlockName(name))) {
            reporter.warn(
              "bem-conventions",
              "The BEM element '" + name
              + "' must be a descendent of '" + config.getBlockName(name)
              + "'.",
              this
            )
          }
        }
        if (config.isModifier(name)) {
          if (!$(this).is("." + config.getBlockName(name))) {
            reporter.warn(
              "bem-conventions",
              "The BEM modifier class '" + name
              + "' was found without the unmodified class '" + config.getBlockName(name)
              +  "'.",
              this
            )
          }
        }
      }
    )
  })
}())

HTMLInspector.rules.add("duplicate-ids", function(listener, reporter) {

  var elements = []

  listener.on("id", function(name) {
    elements.push({id: name, context: this})
  })

  listener.on("afterInspect", function() {

    var duplicates = []
      , element
      , offenders

    while (element = elements.shift()) {
      // find other elements with the same ID
      duplicates = elements.filter(function(el) {
        return element.id === el.id
      })
      // remove elements with the same ID from the elements array
      elements = elements.filter(function(el) {
        return element.id !== el.id
      })
      // report duplicates
      if (duplicates.length) {
        offenders = [element.context].concat(duplicates.map(function(dup) {
          return dup.context
        }))
        reporter.warn(
          "duplicate-ids",
          "The id '" + element.id + "' appears more than once in the document.",
          offenders
        )
      }
    }


  })

})

HTMLInspector.rules.add("inline-event-handlers", function(listener, reporter) {

  listener.on('attribute', function(name, value) {
    if (name.indexOf("on") === 0) {
      reporter.warn(
        "inline-event-handlers",
        "An '" + name + "' attribute was found in the HTML. Use external scripts for event binding instead.",
        this
      )
    }
  })

})

HTMLInspector.rules.add("scoped-styles", function(listener, reporter) {

  var elements = []

  listener.on("element", function(name) {
    var isOutsideHead
      , isScoped
    if (name == "style") {
      isOutsideHead = !$(this).closest("head").length
      isScoped = $(this).attr("scoped") != null
      if (isOutsideHead && !isScoped) {
        reporter.warn(
          "scoped-styles",
          "<style> elements outside of <head> must declare the 'scoped' attribute.",
          this
        )
      }
    }
  })

})

HTMLInspector.rules.add(
  "unique-elements",
  {
    elements: ["title", "main"]
  },
  function(listener, reporter) {

    var map = {}
      , elements = this.elements

    // create the map where the keys are elements that must be unique
    elements.forEach(function(item) {
      map[item] = []
    })

    listener.on("element", function(name) {
      if (elements.indexOf(name) >= 0) {
        map[name].push(this)
      }
    })

    listener.on("afterInspect", function() {
      var offenders
      elements.forEach(function(item) {
        if (map[item].length > 1) {
          reporter.warn(
            "unique-elements",
            "The <" + item + "> element may only appear once in the document.",
            map[item]
          )
        }
      })
    }
  )
})

HTMLInspector.rules.add(
  "unnecessary-elements",
  {
    isUnnecessary: function(element) {
      var name = element.nodeName.toLowerCase()
        , isUnsemantic = name == "div" || name == "span"
        , isAttributed = element.attributes.length === 0
      return isUnsemantic && isAttributed
    }
  },
  function(listener, reporter, config) {
    listener.on('element', function(name) {
      if (config.isUnnecessary(this)) {
        reporter.warn(
          "unnecessary-elements",
          "Do not use <div> or <span> elements without any attributes.",
          this
        )
      }
    }
  )
})

HTMLInspector.rules.add(
  "unused-classes",
  {
    whitelist: /^js\-|^supports\-|^language\-|^lang\-/
  },
  function(listener, reporter, config) {

    var css = HTMLInspector.modules.css
      , classes = css.getClassSelectors()

    listener.on('class', function(name) {
      if (!config.whitelist.test(name) && classes.indexOf(name) == -1) {
        reporter.warn(
          "unused-classes",
          "The class '"
          + name
          + "' is used in the HTML but not found in any stylesheet.",
          this
        )
      }
    }
  )
})

HTMLInspector.rules.add("validate-attributes", function(listener, reporter) {

  var validation = HTMLInspector.modules.validation

  listener.on("element", function(name) {
    var required = validation.getRequiredAttributesForElement(name)
    required.forEach(function(attr) {
      if ($(this).attr(attr) == null) {
        reporter.warn(
          "validate-attributes",
          "The '" + attr + "' attribute is required for <"
          + name + "> elements.",
          this
        )
      }
    }, this)
  })

  listener.on("attribute", function(name) {
    var element = this.nodeName.toLowerCase()
    if (validation.isAttributeObsoleteForElement(name, element)) {
      reporter.warn(
        "validate-attributes",
        "The '" + name + "' attribute is no longer valid on the <"
        + element + "> element and should not be used.",
        this
      )
    }
    else if (!validation.isAttributeValidForElement(name, element)) {
      reporter.warn(
        "validate-attributes",
        "'" + name + "' is not a valid attribute of the <"
        + element + "> element.",
        this
      )
    }
  })

})

HTMLInspector.rules.add("validate-elements", function(listener, reporter) {

  var validation = HTMLInspector.modules.validation

  listener.on("element", function(name) {
    if (validation.isElementObsolete(name)) {
      reporter.warn(
        "validate-elements",
        "The <" + name + "> element is obsolete and should not be used.",
        this
      )
    }
    else if (!validation.isElementValid(name)) {
      reporter.warn(
        "validate-elements",
        "The <" + name + "> element is not a valid HTML element.",
        this
      )
    }
  })

})

// expose HTMLInspector globally
window.HTMLInspector = HTMLInspector

}(this, jQuery, document))