"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../../node_modules/peggy/lib/grammar-location.js
var require_grammar_location = __commonJS({
  "../../../node_modules/peggy/lib/grammar-location.js"(exports2, module2) {
    "use strict";
    var GrammarLocation = class {
      /**
       * Create an instance.
       *
       * @param {any} source The original grammarSource.  Should be a string or
       *   have a toString() method.
       * @param {import("./peg").Location} start The starting offset for the
       *   grammar in the larger file.
       */
      constructor(source, start) {
        this.source = source;
        this.start = start;
      }
      /**
       * Coerce to a string.
       *
       * @returns {string} The source, stringified.
       */
      toString() {
        return String(this.source);
      }
      /**
       * Return a new Location offset from the given location by the start of the
       * grammar.
       *
       * @param {import("./peg").Location} loc The location as if the start of the
       *   grammar was the start of the file.
       * @returns {import("./peg").Location} The offset location.
       */
      offset(loc) {
        return {
          line: loc.line + this.start.line - 1,
          column: loc.line === 1 ? loc.column + this.start.column - 1 : loc.column,
          offset: loc.offset + this.start.offset
        };
      }
      /**
       * If the range has a grammarSource that is a GrammarLocation, offset the
       * start of that range by the GrammarLocation.
       *
       * @param {import("./peg").LocationRange} range The range to extract from.
       * @returns {import("./peg").Location} The offset start if possible, or the
       *   original start.
       */
      static offsetStart(range) {
        if (range.source && typeof range.source.offset === "function") {
          return range.source.offset(range.start);
        }
        return range.start;
      }
      /**
       * If the range has a grammarSource that is a GrammarLocation, offset the
       * end of that range by the GrammarLocation.
       *
       * @param {import("./peg").LocationRange} range The range to extract from.
       * @returns {import("./peg").Location} The offset end if possible, or the
       *   original end.
       */
      static offsetEnd(range) {
        if (range.source && typeof range.source.offset === "function") {
          return range.source.offset(range.end);
        }
        return range.end;
      }
    };
    module2.exports = GrammarLocation;
  }
});

// ../../../node_modules/peggy/lib/grammar-error.js
var require_grammar_error = __commonJS({
  "../../../node_modules/peggy/lib/grammar-error.js"(exports2, module2) {
    "use strict";
    var GrammarLocation = require_grammar_location();
    var setProtoOf = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d, b) {
      d.__proto__ = b;
    } || function(d, b) {
      for (const p in b) {
        if (Object.prototype.hasOwnProperty.call(b, p)) {
          d[p] = b[p];
        }
      }
    };
    var GrammarError = class _GrammarError extends Error {
      constructor(message, location, diagnostics) {
        super(message);
        setProtoOf(this, _GrammarError.prototype);
        this.name = "GrammarError";
        this.location = location;
        if (diagnostics === void 0) {
          diagnostics = [];
        }
        this.diagnostics = diagnostics;
        this.stage = null;
        this.problems = [["error", message, location, diagnostics]];
      }
      toString() {
        let str = super.toString();
        if (this.location) {
          str += "\n at ";
          if (this.location.source !== void 0 && this.location.source !== null) {
            str += `${this.location.source}:`;
          }
          str += `${this.location.start.line}:${this.location.start.column}`;
        }
        for (const diag of this.diagnostics) {
          str += "\n from ";
          if (diag.location.source !== void 0 && diag.location.source !== null) {
            str += `${diag.location.source}:`;
          }
          str += `${diag.location.start.line}:${diag.location.start.column}: ${diag.message}`;
        }
        return str;
      }
      /**
       * Format the error with associated sources.  The `location.source` should have
       * a `toString()` representation in order the result to look nice. If source
       * is `null` or `undefined`, it is skipped from the output
       *
       * Sample output:
       * ```
       * Error: Label "head" is already defined
       *  --> examples/arithmetics.pegjs:15:17
       *    |
       * 15 |   = head:Factor head:(_ ("*" / "/") _ Factor)* {
       *    |                 ^^^^
       * note: Original label location
       *  --> examples/arithmetics.pegjs:15:5
       *    |
       * 15 |   = head:Factor head:(_ ("*" / "/") _ Factor)* {
       *    |     ^^^^
       * ```
       *
       * @param {import("./peg").SourceText[]} sources mapping from location source to source text
       *
       * @returns {string} the formatted error
       */
      format(sources) {
        const srcLines = sources.map(({ source, text }) => ({
          source,
          text: text !== null && text !== void 0 ? String(text).split(/\r\n|\n|\r/g) : []
        }));
        function entry(location, indent, message = "") {
          let str = "";
          const src = srcLines.find(({ source }) => source === location.source);
          const s = location.start;
          const offset_s = GrammarLocation.offsetStart(location);
          if (src) {
            const e = location.end;
            const line = src.text[s.line - 1];
            const last = s.line === e.line ? e.column : line.length + 1;
            const hatLen = last - s.column || 1;
            if (message) {
              str += `
note: ${message}`;
            }
            str += `
 --> ${location.source}:${offset_s.line}:${offset_s.column}
${"".padEnd(indent)} |
${offset_s.line.toString().padStart(indent)} | ${line}
${"".padEnd(indent)} | ${"".padEnd(s.column - 1)}${"".padEnd(hatLen, "^")}`;
          } else {
            str += `
 at ${location.source}:${offset_s.line}:${offset_s.column}`;
            if (message) {
              str += `: ${message}`;
            }
          }
          return str;
        }
        function formatProblem(severity, message, location, diagnostics = []) {
          let maxLine = -Infinity;
          if (location) {
            maxLine = diagnostics.reduce(
              (t, { location: location2 }) => Math.max(
                t,
                GrammarLocation.offsetStart(location2).line
              ),
              location.start.line
            );
          } else {
            maxLine = Math.max.apply(
              null,
              diagnostics.map((d) => d.location.start.line)
            );
          }
          maxLine = maxLine.toString().length;
          let str = `${severity}: ${message}`;
          if (location) {
            str += entry(location, maxLine);
          }
          for (const diag of diagnostics) {
            str += entry(diag.location, maxLine, diag.message);
          }
          return str;
        }
        return this.problems.filter((p) => p[0] !== "info").map((p) => formatProblem(...p)).join("\n\n");
      }
    };
    module2.exports = GrammarError;
  }
});

// ../../../node_modules/peggy/lib/compiler/visitor.js
var require_visitor = __commonJS({
  "../../../node_modules/peggy/lib/compiler/visitor.js"(exports2, module2) {
    "use strict";
    var visitor2 = {
      build(functions) {
        function visit(node, ...args) {
          return functions[node.type](node, ...args);
        }
        function visitNop() {
        }
        function visitExpression(node, ...args) {
          return visit(node.expression, ...args);
        }
        function visitChildren(property) {
          return function(node, ...args) {
            node[property].forEach((child) => visit(child, ...args));
          };
        }
        const DEFAULT_FUNCTIONS = {
          grammar(node, ...args) {
            for (const imp of node.imports) {
              visit(imp, ...args);
            }
            if (node.topLevelInitializer) {
              if (Array.isArray(node.topLevelInitializer)) {
                for (const tli of node.topLevelInitializer) {
                  visit(tli, ...args);
                }
              } else {
                visit(node.topLevelInitializer, ...args);
              }
            }
            if (node.initializer) {
              if (Array.isArray(node.initializer)) {
                for (const init of node.initializer) {
                  visit(init, ...args);
                }
              } else {
                visit(node.initializer, ...args);
              }
            }
            node.rules.forEach((rule) => visit(rule, ...args));
          },
          grammar_import: visitNop,
          top_level_initializer: visitNop,
          initializer: visitNop,
          rule: visitExpression,
          named: visitExpression,
          choice: visitChildren("alternatives"),
          action: visitExpression,
          sequence: visitChildren("elements"),
          labeled: visitExpression,
          text: visitExpression,
          simple_and: visitExpression,
          simple_not: visitExpression,
          optional: visitExpression,
          zero_or_more: visitExpression,
          one_or_more: visitExpression,
          repeated(node, ...args) {
            if (node.delimiter) {
              visit(node.delimiter, ...args);
            }
            return visit(node.expression, ...args);
          },
          group: visitExpression,
          semantic_and: visitNop,
          semantic_not: visitNop,
          rule_ref: visitNop,
          library_ref: visitNop,
          literal: visitNop,
          class: visitNop,
          any: visitNop
        };
        Object.keys(DEFAULT_FUNCTIONS).forEach((type) => {
          if (!Object.prototype.hasOwnProperty.call(functions, type)) {
            functions[type] = DEFAULT_FUNCTIONS[type];
          }
        });
        return visit;
      }
    };
    module2.exports = visitor2;
  }
});

// ../../../node_modules/peggy/lib/compiler/asts.js
var require_asts = __commonJS({
  "../../../node_modules/peggy/lib/compiler/asts.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function combinePossibleArrays(a, b) {
      if (!(a && b)) {
        return a || b;
      }
      const aa = Array.isArray(a) ? a : [a];
      aa.push(b);
      return aa;
    }
    var asts = {
      /**
       * Find the rule with the given name, if it exists.
       *
       * @param {PEG.ast.Grammar} ast
       * @param {string} name
       * @returns {PEG.ast.Rule | undefined}
       */
      findRule(ast2, name) {
        for (let i = 0; i < ast2.rules.length; i++) {
          if (ast2.rules[i].name === name) {
            return ast2.rules[i];
          }
        }
        return void 0;
      },
      /**
       * Find the index of the rule with the given name, if it exists.
       * Otherwise returns -1.
       *
       * @param {PEG.ast.Grammar} ast
       * @param {string} name
       * @returns {number}
       */
      indexOfRule(ast2, name) {
        for (let i = 0; i < ast2.rules.length; i++) {
          if (ast2.rules[i].name === name) {
            return i;
          }
        }
        return -1;
      },
      alwaysConsumesOnSuccess(ast2, node) {
        function consumesTrue() {
          return true;
        }
        function consumesFalse() {
          return false;
        }
        const consumes = visitor2.build({
          choice(node2) {
            return node2.alternatives.every(consumes);
          },
          sequence(node2) {
            return node2.elements.some(consumes);
          },
          simple_and: consumesFalse,
          simple_not: consumesFalse,
          optional: consumesFalse,
          zero_or_more: consumesFalse,
          repeated(node2) {
            const min = node2.min ? node2.min : node2.max;
            if (min.type !== "constant" || min.value === 0) {
              return false;
            }
            if (consumes(node2.expression)) {
              return true;
            }
            if (min.value > 1 && node2.delimiter && consumes(node2.delimiter)) {
              return true;
            }
            return false;
          },
          semantic_and: consumesFalse,
          semantic_not: consumesFalse,
          rule_ref(node2) {
            const rule = asts.findRule(ast2, node2.name);
            return rule ? consumes(rule) : void 0;
          },
          library_ref() {
            return false;
          },
          literal(node2) {
            return node2.value !== "";
          },
          class: consumesTrue,
          any: consumesTrue
        });
        return consumes(node);
      },
      combine(asts2) {
        return asts2.reduce((combined, ast2) => {
          combined.topLevelInitializer = combinePossibleArrays(
            combined.topLevelInitializer,
            ast2.topLevelInitializer
          );
          combined.initializer = combinePossibleArrays(
            combined.initializer,
            ast2.initializer
          );
          combined.rules = combined.rules.concat(ast2.rules);
          return combined;
        });
      }
    };
    module2.exports = asts;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/add-imported-rules.js
var require_add_imported_rules = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/add-imported-rules.js"(exports2, module2) {
    "use strict";
    function addImportedRules2(ast2) {
      let libraryNumber = 0;
      for (const imp of ast2.imports) {
        for (const what of imp.what) {
          let original = void 0;
          switch (what.type) {
            case "import_binding_all":
              continue;
            case "import_binding_default":
              break;
            case "import_binding":
              original = what.binding;
              break;
            case "import_binding_rename":
              original = what.rename;
              break;
            default:
              throw new TypeError("Unknown binding type");
          }
          ast2.rules.push({
            type: "rule",
            name: what.binding,
            nameLocation: what.location,
            expression: {
              type: "library_ref",
              name: original,
              library: imp.from.module,
              libraryNumber,
              location: what.location
            },
            location: imp.from.location
          });
        }
        libraryNumber++;
      }
    }
    module2.exports = addImportedRules2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/fix-library-numbers.js
var require_fix_library_numbers = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/fix-library-numbers.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function findLibraryNumber(ast2, name) {
      let libraryNumber = 0;
      for (const imp of ast2.imports) {
        for (const what of imp.what) {
          if (what.type === "import_binding_all" && what.binding === name) {
            return libraryNumber;
          }
        }
        libraryNumber++;
      }
      return -1;
    }
    function fixLibraryNumbers2(ast2, _options, session2) {
      const check = visitor2.build({
        library_ref(node) {
          if (node.libraryNumber === -1) {
            node.libraryNumber = findLibraryNumber(ast2, node.library);
            if (node.libraryNumber === -1) {
              session2.error(
                `Unknown module "${node.library}"`,
                node.location
              );
            }
          }
        }
      });
      check(ast2);
    }
    module2.exports = fixLibraryNumbers2;
  }
});

// ../../../node_modules/peggy/lib/compiler/opcodes.js
var require_opcodes = __commonJS({
  "../../../node_modules/peggy/lib/compiler/opcodes.js"(exports2, module2) {
    "use strict";
    var opcodes = {
      // Stack Manipulation
      /** @deprecated Unused */
      PUSH: 0,
      // PUSH c
      PUSH_EMPTY_STRING: 35,
      // PUSH_EMPTY_STRING
      PUSH_UNDEFINED: 1,
      // PUSH_UNDEFINED
      PUSH_NULL: 2,
      // PUSH_NULL
      PUSH_FAILED: 3,
      // PUSH_FAILED
      PUSH_EMPTY_ARRAY: 4,
      // PUSH_EMPTY_ARRAY
      PUSH_CURR_POS: 5,
      // PUSH_CURR_POS
      POP: 6,
      // POP
      POP_CURR_POS: 7,
      // POP_CURR_POS
      POP_N: 8,
      // POP_N n
      NIP: 9,
      // NIP
      APPEND: 10,
      // APPEND
      WRAP: 11,
      // WRAP n
      TEXT: 12,
      // TEXT
      PLUCK: 36,
      // PLUCK n, k, p1, ..., pK
      // Conditions and Loops
      IF: 13,
      // IF t, f
      IF_ERROR: 14,
      // IF_ERROR t, f
      IF_NOT_ERROR: 15,
      // IF_NOT_ERROR t, f
      IF_LT: 30,
      // IF_LT min, t, f
      IF_GE: 31,
      // IF_GE max, t, f
      IF_LT_DYNAMIC: 32,
      // IF_LT_DYNAMIC min, t, f
      IF_GE_DYNAMIC: 33,
      // IF_GE_DYNAMIC max, t, f
      WHILE_NOT_ERROR: 16,
      // WHILE_NOT_ERROR b
      // Matching
      MATCH_ANY: 17,
      // MATCH_ANY a, f, ...
      MATCH_STRING: 18,
      // MATCH_STRING s, a, f, ...
      MATCH_STRING_IC: 19,
      // MATCH_STRING_IC s, a, f, ...
      MATCH_CHAR_CLASS: 20,
      // MATCH_CHAR_CLASS c, a, f, ...
      /** @deprecated Replaced with `MATCH_CHAR_CLASS` */
      MATCH_REGEXP: 20,
      // MATCH_REGEXP r, a, f, ...
      ACCEPT_N: 21,
      // ACCEPT_N n
      ACCEPT_STRING: 22,
      // ACCEPT_STRING s
      FAIL: 23,
      // FAIL e
      // Calls
      LOAD_SAVED_POS: 24,
      // LOAD_SAVED_POS p
      UPDATE_SAVED_POS: 25,
      // UPDATE_SAVED_POS
      CALL: 26,
      // CALL f, n, pc, p1, p2, ..., pN
      // Rules
      RULE: 27,
      // RULE r
      LIBRARY_RULE: 41,
      // LIBRARY_RULE moduleIndex, whatIndex
      // Failure Reporting
      SILENT_FAILS_ON: 28,
      // SILENT_FAILS_ON
      SILENT_FAILS_OFF: 29,
      // SILENT_FAILS_OFF
      // Because the tests have hard-coded opcode numbers, don't renumber
      // existing opcodes.  New opcodes that have been put in the correct
      // sections above are repeated here in order to ensure we don't
      // reuse them.
      //
      // IF_LT: 30
      // IF_GE: 31
      // IF_LT_DYNAMIC: 32
      // IF_GE_DYNAMIC: 33
      // 34 reserved for @mingun
      // PUSH_EMPTY_STRING: 35
      // PLUCK: 36
      SOURCE_MAP_PUSH: 37,
      // SOURCE_MAP_PUSH loc-index
      SOURCE_MAP_POP: 38,
      // SOURCE_MAP_POP
      SOURCE_MAP_LABEL_PUSH: 39,
      // SOURCE_MAP_LABEL_PUSH sp, literal-index, loc-index
      SOURCE_MAP_LABEL_POP: 40
      // SOURCE_MAP_LABEL_POP sp
      // LIBRARY_RULE:         41,
    };
    module2.exports = opcodes;
  }
});

// ../../../node_modules/peggy/lib/compiler/intern.js
var require_intern = __commonJS({
  "../../../node_modules/peggy/lib/compiler/intern.js"(exports2, module2) {
    "use strict";
    var Intern = class {
      /**
       * @typedef {object} InternOptions
       * @property {(input: V) => string} [stringify=String] Represent the
       *   converted input as a string, for value comparison.
       * @property {(input: T) => V} [convert=(x) => x] Convert the input to its
       *   stored form.  Required if type V is not the same as type T.  Return
       *   falsy value to have this input not be added; add() will return -1 in
       *   this case.
       */
      /**
       * @param {InternOptions} [options]
       */
      constructor(options2) {
        this.options = {
          stringify: String,
          convert: (x) => (
            /** @type {V} */
            /** @type {unknown} */
            x
          ),
          ...options2
        };
        this.items = [];
        this.offsets = /* @__PURE__ */ Object.create(null);
      }
      /**
       * Intern an item, getting it's asssociated number.  Returns -1 for falsy
       * inputs. O(1) with constants tied to the convert and stringify options.
       *
       * @param {T} input
       * @return {number}
       */
      add(input) {
        const c = this.options.convert(input);
        if (!c) {
          return -1;
        }
        const s = this.options.stringify(c);
        let num = this.offsets[s];
        if (num === void 0) {
          num = this.items.push(c) - 1;
          this.offsets[s] = num;
        }
        return num;
      }
      /**
       * @param {number} i
       * @returns {V}
       */
      get(i) {
        return this.items[i];
      }
      /**
       * @template U
       * @param {(value: V, index: number, array: V[]) => U} fn
       * @returns {U[]}
       */
      map(fn) {
        return this.items.map(fn);
      }
    };
    module2.exports = Intern;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/inference-match-result.js
var require_inference_match_result = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/inference-match-result.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    var asts = require_asts();
    var GrammarError = require_grammar_error();
    var ALWAYS_MATCH = 1;
    var SOMETIMES_MATCH = 0;
    var NEVER_MATCH = -1;
    function inferenceMatchResult2(ast2) {
      function sometimesMatch(node) {
        return node.match = SOMETIMES_MATCH;
      }
      function alwaysMatch(node) {
        inference(node.expression);
        return node.match = ALWAYS_MATCH;
      }
      function inferenceExpression(node) {
        return node.match = inference(node.expression);
      }
      function inferenceElements(elements, forChoice) {
        const length = elements.length;
        let always = 0;
        let never = 0;
        for (let i = 0; i < length; ++i) {
          const result = inference(elements[i]);
          if (result === ALWAYS_MATCH) {
            ++always;
          }
          if (result === NEVER_MATCH) {
            ++never;
          }
        }
        if (always === length) {
          return ALWAYS_MATCH;
        }
        if (forChoice) {
          return never === length ? NEVER_MATCH : SOMETIMES_MATCH;
        }
        return never > 0 ? NEVER_MATCH : SOMETIMES_MATCH;
      }
      const inference = visitor2.build({
        rule(node) {
          let oldResult;
          let count = 0;
          if (typeof node.match === "undefined") {
            node.match = SOMETIMES_MATCH;
            do {
              oldResult = node.match;
              node.match = inference(node.expression);
              if (++count > 6) {
                throw new GrammarError(
                  "Infinity cycle detected when trying to evaluate node match result",
                  node.location
                );
              }
            } while (oldResult !== node.match);
          }
          return node.match;
        },
        named: inferenceExpression,
        choice(node) {
          return node.match = inferenceElements(node.alternatives, true);
        },
        action: inferenceExpression,
        sequence(node) {
          return node.match = inferenceElements(node.elements, false);
        },
        labeled: inferenceExpression,
        text: inferenceExpression,
        simple_and: inferenceExpression,
        simple_not(node) {
          return node.match = -inference(node.expression);
        },
        optional: alwaysMatch,
        zero_or_more: alwaysMatch,
        one_or_more: inferenceExpression,
        repeated(node) {
          const match = inference(node.expression);
          const dMatch = node.delimiter ? inference(node.delimiter) : NEVER_MATCH;
          const min = node.min ? node.min : node.max;
          if (min.type !== "constant" || node.max.type !== "constant") {
            return node.match = SOMETIMES_MATCH;
          }
          if (node.max.value === 0 || node.max.value !== null && min.value > node.max.value) {
            return node.match = NEVER_MATCH;
          }
          if (match === NEVER_MATCH) {
            return node.match = min.value === 0 ? ALWAYS_MATCH : NEVER_MATCH;
          }
          if (match === ALWAYS_MATCH) {
            if (node.delimiter && min.value >= 2) {
              return node.match = dMatch;
            }
            return node.match = ALWAYS_MATCH;
          }
          if (node.delimiter && min.value >= 2) {
            return (
              // If a delimiter never match then the range also never match (because
              // there at least one delimiter)
              node.match = dMatch === NEVER_MATCH ? NEVER_MATCH : SOMETIMES_MATCH
            );
          }
          return node.match = min.value === 0 ? ALWAYS_MATCH : SOMETIMES_MATCH;
        },
        group: inferenceExpression,
        semantic_and: sometimesMatch,
        semantic_not: sometimesMatch,
        rule_ref(node) {
          const rule = asts.findRule(ast2, node.name);
          if (!rule) {
            return SOMETIMES_MATCH;
          }
          return node.match = inference(rule);
        },
        library_ref() {
          return 0;
        },
        literal(node) {
          const match = node.value.length === 0 ? ALWAYS_MATCH : SOMETIMES_MATCH;
          return node.match = match;
        },
        class(node) {
          const match = node.parts.length === 0 ? NEVER_MATCH : SOMETIMES_MATCH;
          return node.match = match;
        },
        // |any| not match on empty input
        any: sometimesMatch
      });
      inference(ast2);
    }
    inferenceMatchResult2.ALWAYS_MATCH = ALWAYS_MATCH;
    inferenceMatchResult2.SOMETIMES_MATCH = SOMETIMES_MATCH;
    inferenceMatchResult2.NEVER_MATCH = NEVER_MATCH;
    module2.exports = inferenceMatchResult2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/generate-bytecode.js
var require_generate_bytecode = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/generate-bytecode.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var op = require_opcodes();
    var visitor2 = require_visitor();
    var Intern = require_intern();
    var { ALWAYS_MATCH, SOMETIMES_MATCH, NEVER_MATCH } = require_inference_match_result();
    function generateBytecode2(ast2, options2) {
      const literals = new Intern();
      const classes = new Intern({
        stringify: JSON.stringify,
        /** @type {(input: PEG.ast.CharacterClass) => PEG.ast.GrammarCharacterClass} */
        convert: (node) => ({
          value: node.parts,
          inverted: node.inverted,
          ignoreCase: node.ignoreCase
        })
      });
      const expectations = new Intern({
        stringify: JSON.stringify
      });
      const importedNames = new Intern();
      const functions = [];
      const locations = [];
      function addFunctionConst(predicate, params, node) {
        const func = {
          predicate,
          params,
          body: node.code,
          location: node.codeLocation
        };
        const pattern = JSON.stringify(func);
        const index = functions.findIndex((f) => JSON.stringify(f) === pattern);
        return index === -1 ? functions.push(func) - 1 : index;
      }
      function addLocation(location) {
        return locations.push(location) - 1;
      }
      function cloneEnv(env) {
        const clone = {};
        Object.keys(env).forEach((name) => {
          clone[name] = env[name];
        });
        return clone;
      }
      function buildSequence(first, ...args) {
        return first.concat(...args);
      }
      function buildCondition(match, condCode, thenCode, elseCode) {
        if (match === ALWAYS_MATCH) {
          return thenCode;
        }
        if (match === NEVER_MATCH) {
          return elseCode;
        }
        return condCode.concat(
          [thenCode.length, elseCode.length],
          thenCode,
          elseCode
        );
      }
      function buildLoop(condCode, bodyCode) {
        return condCode.concat([bodyCode.length], bodyCode);
      }
      function buildCall(functionIndex, delta, env, sp) {
        const params = Object.keys(env).map((name) => sp - env[name]);
        return [op.CALL, functionIndex, delta, params.length].concat(params);
      }
      function buildSimplePredicate(expression, negative, context) {
        const match = expression.match || 0;
        return buildSequence(
          [op.PUSH_CURR_POS],
          [op.SILENT_FAILS_ON],
          // eslint-disable-next-line no-use-before-define -- Mutual recursion
          generate2(expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          }),
          [op.SILENT_FAILS_OFF],
          buildCondition(
            negative ? -match : match,
            [negative ? op.IF_ERROR : op.IF_NOT_ERROR],
            buildSequence(
              [op.POP],
              [negative ? op.POP : op.POP_CURR_POS],
              [op.PUSH_UNDEFINED]
            ),
            buildSequence(
              [op.POP],
              [negative ? op.POP_CURR_POS : op.POP],
              [op.PUSH_FAILED]
            )
          )
        );
      }
      function buildSemanticPredicate(node, negative, context) {
        const functionIndex = addFunctionConst(
          true,
          Object.keys(context.env),
          node
        );
        return buildSequence(
          [op.UPDATE_SAVED_POS],
          buildCall(functionIndex, 0, context.env, context.sp),
          buildCondition(
            node.match || 0,
            [op.IF],
            buildSequence(
              [op.POP],
              negative ? [op.PUSH_FAILED] : [op.PUSH_UNDEFINED]
            ),
            buildSequence(
              [op.POP],
              negative ? [op.PUSH_UNDEFINED] : [op.PUSH_FAILED]
            )
          )
        );
      }
      function buildAppendLoop(expressionCode) {
        return buildLoop(
          [op.WHILE_NOT_ERROR],
          buildSequence([op.APPEND], expressionCode)
        );
      }
      function unknownBoundary(boundary) {
        const b = (
          /** @type {{ type: string }} */
          boundary
        );
        return new Error(`Unknown boundary type "${b.type}" for the "repeated" node`);
      }
      function buildRangeCall(boundary, env, sp, offset) {
        switch (boundary.type) {
          case "constant":
            return { pre: [], post: [], sp };
          case "variable":
            boundary.sp = offset + sp - env[boundary.value];
            return { pre: [], post: [], sp };
          case "function": {
            boundary.sp = offset;
            const functionIndex = addFunctionConst(
              true,
              Object.keys(env),
              { code: boundary.value, codeLocation: boundary.codeLocation }
            );
            return {
              pre: buildCall(functionIndex, 0, env, sp),
              post: [op.NIP],
              // +1 for the function result
              sp: sp + 1
            };
          }
          // istanbul ignore next Because we never generate invalid boundary type we cannot reach this branch
          default:
            throw unknownBoundary(boundary);
        }
      }
      function buildCheckMax(expressionCode, max) {
        if (max.value !== null) {
          const checkCode = max.type === "constant" ? [op.IF_GE, max.value] : [op.IF_GE_DYNAMIC, max.sp || 0];
          return buildCondition(
            SOMETIMES_MATCH,
            checkCode,
            // if (r.length >= max)   stack:[ [elem...] ]
            [op.PUSH_FAILED],
            //   elem = peg$FAILED;   stack:[ [elem...], peg$FAILED ]
            expressionCode
            // else
          );
        }
        return expressionCode;
      }
      function buildCheckMin(expressionCode, min) {
        const checkCode = min.type === "constant" ? [op.IF_LT, min.value] : [op.IF_LT_DYNAMIC, min.sp || 0];
        return buildSequence(
          expressionCode,
          // result = [elem...];      stack:[ pos, [elem...] ]
          buildCondition(
            SOMETIMES_MATCH,
            checkCode,
            // if (result.length < min) {
            /* eslint-disable @stylistic/indent -- Clarity */
            [
              op.POP,
              op.POP_CURR_POS,
              //   currPos = savedPos;    stack:[  ]
              op.PUSH_FAILED
            ],
            //   result = peg$FAILED;   stack:[ peg$FAILED ]
            /* eslint-enable @stylistic/indent */
            [op.NIP]
            // }                        stack:[ [elem...] ]
          )
        );
      }
      function buildRangeBody(delimiterNode, expressionMatch, expressionCode, context, offset) {
        if (delimiterNode) {
          return buildSequence(
            //                          stack:[  ]
            [op.PUSH_CURR_POS],
            // pos = peg$currPos;       stack:[ pos ]
            // eslint-disable-next-line no-use-before-define -- Mutual recursion
            generate2(delimiterNode, {
              // item = delim();          stack:[ pos, delim ]
              // +1 for the saved offset
              sp: context.sp + offset + 1,
              env: cloneEnv(context.env),
              action: null
            }),
            buildCondition(
              delimiterNode.match || 0,
              [op.IF_NOT_ERROR],
              // if (item !== peg$FAILED) {
              buildSequence(
                [op.POP],
                //                          stack:[ pos ]
                expressionCode,
                //   item = expr();         stack:[ pos, item ]
                buildCondition(
                  -expressionMatch,
                  [op.IF_ERROR],
                  //   if (item === peg$FAILED) {
                  // If element FAILED, rollback currPos to saved value.
                  /* eslint-disable @stylistic/indent -- Clarity */
                  [
                    op.POP,
                    //                          stack:[ pos ]
                    op.POP_CURR_POS,
                    //     peg$currPos = pos;   stack:[  ]
                    op.PUSH_FAILED
                  ],
                  //     item = peg$FAILED;   stack:[ peg$FAILED ]
                  /* eslint-enable @stylistic/indent */
                  // Else, just drop saved currPos.
                  [op.NIP]
                  //   }                      stack:[ item ]
                )
              ),
              // }
              // If delimiter FAILED, currPos not changed, so just drop it.
              [op.NIP]
              //                          stack:[ peg$FAILED ]
            )
            //                          stack:[ <?> ]
          );
        }
        return expressionCode;
      }
      function wrapGenerators(generators) {
        if (options2 && options2.output === "source-and-map") {
          Object.keys(generators).forEach((name) => {
            const generator = generators[name];
            generators[name] = function(node, ...args) {
              const generated = generator(node, ...args);
              if (generated === void 0 || !node.location) {
                return generated;
              }
              return buildSequence(
                [
                  op.SOURCE_MAP_PUSH,
                  addLocation(node.location)
                ],
                generated,
                [
                  op.SOURCE_MAP_POP
                ]
              );
            };
          });
        }
        return visitor2.build(generators);
      }
      const generate2 = wrapGenerators({
        grammar(node) {
          node.rules.forEach(generate2);
          node.literals = literals.items;
          node.classes = classes.items;
          node.expectations = expectations.items;
          node.importedNames = importedNames.items;
          node.functions = functions;
          node.locations = locations;
        },
        rule(node) {
          node.bytecode = generate2(node.expression, {
            sp: -1,
            // Stack pointer
            env: {},
            // Mapping of label names to stack positions
            pluck: [],
            // Fields that have been picked
            action: null
            // Action nodes pass themselves to children here
          });
        },
        named(node, context) {
          const match = node.match || 0;
          const nameIndex = match === NEVER_MATCH ? -1 : expectations.add({ type: "rule", value: node.name });
          return buildSequence(
            [op.SILENT_FAILS_ON],
            generate2(node.expression, context),
            [op.SILENT_FAILS_OFF],
            buildCondition(match, [op.IF_ERROR], [op.FAIL, nameIndex], [])
          );
        },
        choice(node, context) {
          function buildAlternativesCode(alternatives, context2) {
            const match = alternatives[0].match || 0;
            const first = generate2(alternatives[0], {
              sp: context2.sp,
              env: cloneEnv(context2.env),
              action: null
            });
            if (match === ALWAYS_MATCH) {
              return first;
            }
            return buildSequence(
              first,
              alternatives.length > 1 ? buildCondition(
                SOMETIMES_MATCH,
                [op.IF_ERROR],
                buildSequence(
                  [op.POP],
                  buildAlternativesCode(alternatives.slice(1), context2)
                ),
                []
              ) : []
            );
          }
          return buildAlternativesCode(node.alternatives, context);
        },
        action(node, context) {
          const env = cloneEnv(context.env);
          const emitCall = node.expression.type !== "sequence" || node.expression.elements.length === 0;
          const expressionCode = generate2(node.expression, {
            sp: context.sp + (emitCall ? 1 : 0),
            env,
            action: node
          });
          const match = node.expression.match || 0;
          const functionIndex = emitCall && match !== NEVER_MATCH ? addFunctionConst(false, Object.keys(env), node) : -1;
          return emitCall ? buildSequence(
            [op.PUSH_CURR_POS],
            expressionCode,
            buildCondition(
              match,
              [op.IF_NOT_ERROR],
              buildSequence(
                [op.LOAD_SAVED_POS, 1],
                buildCall(functionIndex, 1, env, context.sp + 2)
              ),
              []
            ),
            [op.NIP]
          ) : expressionCode;
        },
        sequence(node, context) {
          function buildElementsCode(elements, context2) {
            if (elements.length > 0) {
              const processedCount = node.elements.length - elements.length + 1;
              return buildSequence(
                generate2(elements[0], {
                  sp: context2.sp,
                  env: context2.env,
                  pluck: context2.pluck,
                  action: null
                }),
                buildCondition(
                  elements[0].match || 0,
                  [op.IF_NOT_ERROR],
                  buildElementsCode(elements.slice(1), {
                    sp: context2.sp + 1,
                    env: context2.env,
                    pluck: context2.pluck,
                    action: context2.action
                  }),
                  buildSequence(
                    processedCount > 1 ? [op.POP_N, processedCount] : [op.POP],
                    [op.POP_CURR_POS],
                    [op.PUSH_FAILED]
                  )
                )
              );
            } else {
              if (context2.pluck && context2.pluck.length > 0) {
                return buildSequence(
                  [op.PLUCK, node.elements.length + 1, context2.pluck.length],
                  context2.pluck.map((eSP) => context2.sp - eSP)
                );
              }
              if (context2.action) {
                const functionIndex = addFunctionConst(
                  false,
                  Object.keys(context2.env),
                  context2.action
                );
                return buildSequence(
                  [op.LOAD_SAVED_POS, node.elements.length],
                  buildCall(
                    functionIndex,
                    node.elements.length + 1,
                    context2.env,
                    context2.sp
                  )
                );
              } else {
                return buildSequence([op.WRAP, node.elements.length], [op.NIP]);
              }
            }
          }
          return buildSequence(
            [op.PUSH_CURR_POS],
            buildElementsCode(node.elements, {
              sp: context.sp + 1,
              env: context.env,
              pluck: [],
              action: context.action
            })
          );
        },
        labeled(node, context) {
          let env = context.env;
          const label = node.label;
          const sp = context.sp + 1;
          if (label) {
            env = cloneEnv(context.env);
            context.env[label] = sp;
          }
          if (node.pick) {
            context.pluck.push(sp);
          }
          const expression = generate2(node.expression, {
            sp: context.sp,
            env,
            action: null
          });
          if (label && node.labelLocation && options2 && options2.output === "source-and-map") {
            return buildSequence(
              [
                op.SOURCE_MAP_LABEL_PUSH,
                sp,
                literals.add(label),
                addLocation(node.labelLocation)
              ],
              expression,
              [op.SOURCE_MAP_LABEL_POP, sp]
            );
          }
          return expression;
        },
        text(node, context) {
          return buildSequence(
            [op.PUSH_CURR_POS],
            generate2(node.expression, {
              sp: context.sp + 1,
              env: cloneEnv(context.env),
              action: null
            }),
            buildCondition(
              node.match || 0,
              [op.IF_NOT_ERROR],
              buildSequence([op.POP], [op.TEXT]),
              [op.NIP]
            )
          );
        },
        simple_and(node, context) {
          return buildSimplePredicate(node.expression, false, context);
        },
        simple_not(node, context) {
          return buildSimplePredicate(node.expression, true, context);
        },
        optional(node, context) {
          return buildSequence(
            generate2(node.expression, {
              sp: context.sp,
              env: cloneEnv(context.env),
              action: null
            }),
            buildCondition(
              // Check expression match, not the node match
              // If expression always match, no need to replace FAILED to NULL,
              // because FAILED will never appeared
              -(node.expression.match || 0),
              [op.IF_ERROR],
              buildSequence([op.POP], [op.PUSH_NULL]),
              []
            )
          );
        },
        zero_or_more(node, context) {
          const expressionCode = generate2(node.expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          });
          return buildSequence(
            [op.PUSH_EMPTY_ARRAY],
            expressionCode,
            buildAppendLoop(expressionCode),
            [op.POP]
          );
        },
        one_or_more(node, context) {
          const expressionCode = generate2(node.expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          });
          return buildSequence(
            [op.PUSH_EMPTY_ARRAY],
            expressionCode,
            buildCondition(
              // Condition depends on the expression match, not the node match
              node.expression.match || 0,
              [op.IF_NOT_ERROR],
              buildSequence(buildAppendLoop(expressionCode), [op.POP]),
              buildSequence([op.POP], [op.POP], [op.PUSH_FAILED])
            )
          );
        },
        repeated(node, context) {
          const min = node.min ? node.min : node.max;
          const hasMin = min.type !== "constant" || min.value > 0;
          const hasBoundedMax = node.max.type !== "constant" && node.max.value !== null;
          const offset = hasMin ? 2 : 1;
          const minCode = node.min ? buildRangeCall(
            node.min,
            context.env,
            context.sp,
            // +1 for the result slot with an array
            // +1 for the saved position
            // +1 if we have a "function" maximum it occupies an additional slot in the stack
            2 + (node.max.type === "function" ? 1 : 0)
          ) : { pre: [], post: [], sp: context.sp };
          const maxCode = buildRangeCall(node.max, context.env, minCode.sp, offset);
          const firstExpressionCode = generate2(node.expression, {
            sp: maxCode.sp + offset,
            env: cloneEnv(context.env),
            action: null
          });
          const expressionCode = node.delimiter !== null ? generate2(node.expression, {
            // +1 for the saved position before parsing the `delimiter elem` pair
            sp: maxCode.sp + offset + 1,
            env: cloneEnv(context.env),
            action: null
          }) : firstExpressionCode;
          const bodyCode = buildRangeBody(
            node.delimiter,
            node.expression.match || 0,
            expressionCode,
            context,
            offset
          );
          const checkMaxCode = buildCheckMax(bodyCode, node.max);
          const firstElemCode = hasBoundedMax ? buildCheckMax(firstExpressionCode, node.max) : firstExpressionCode;
          const mainLoopCode = buildSequence(
            // If the low boundary present, then backtracking is possible, so save the current pos
            hasMin ? [op.PUSH_CURR_POS] : [],
            // var savedPos = curPos;   stack:[ pos ]
            [op.PUSH_EMPTY_ARRAY],
            // var result = [];         stack:[ pos, [] ]
            firstElemCode,
            // var elem = expr();       stack:[ pos, [], elem ]
            buildAppendLoop(checkMaxCode),
            // while(...)r.push(elem);  stack:[ pos, [...], elem|peg$FAILED ]
            [op.POP]
            //                          stack:[ pos, [...] ] (pop elem===`peg$FAILED`)
          );
          return buildSequence(
            minCode.pre,
            maxCode.pre,
            // Check the low boundary, if it is defined and not |0|.
            hasMin ? buildCheckMin(mainLoopCode, min) : mainLoopCode,
            maxCode.post,
            minCode.post
          );
        },
        group(node, context) {
          return generate2(node.expression, {
            sp: context.sp,
            env: cloneEnv(context.env),
            action: null
          });
        },
        semantic_and(node, context) {
          return buildSemanticPredicate(node, false, context);
        },
        semantic_not(node, context) {
          return buildSemanticPredicate(node, true, context);
        },
        rule_ref(node) {
          return [op.RULE, asts.indexOfRule(ast2, node.name)];
        },
        library_ref(node) {
          return [
            op.LIBRARY_RULE,
            node.libraryNumber,
            importedNames.add(node.name)
          ];
        },
        literal(node) {
          if (node.value.length > 0) {
            const match = node.match || 0;
            const needConst = match === SOMETIMES_MATCH || match === ALWAYS_MATCH && !node.ignoreCase;
            const stringIndex = needConst ? literals.add(
              node.ignoreCase ? node.value.toLowerCase() : node.value
            ) : -1;
            const expectedIndex = match !== ALWAYS_MATCH ? expectations.add({
              type: "literal",
              value: node.value,
              ignoreCase: node.ignoreCase
            }) : -1;
            return buildCondition(
              match,
              node.ignoreCase ? [op.MATCH_STRING_IC, stringIndex] : [op.MATCH_STRING, stringIndex],
              node.ignoreCase ? [op.ACCEPT_N, node.value.length] : [op.ACCEPT_STRING, stringIndex],
              [op.FAIL, expectedIndex]
            );
          }
          return [op.PUSH_EMPTY_STRING];
        },
        class(node) {
          const match = node.match || 0;
          const classIndex = match === SOMETIMES_MATCH ? classes.add(node) : -1;
          const expectedIndex = match !== ALWAYS_MATCH ? expectations.add({
            type: "class",
            value: node.parts,
            inverted: node.inverted,
            ignoreCase: node.ignoreCase
          }) : -1;
          return buildCondition(
            match,
            [op.MATCH_CHAR_CLASS, classIndex],
            [op.ACCEPT_N, 1],
            [op.FAIL, expectedIndex]
          );
        },
        any(node) {
          const match = node.match || 0;
          const expectedIndex = match !== ALWAYS_MATCH ? expectations.add({
            type: "any"
          }) : -1;
          return buildCondition(
            match,
            [op.MATCH_ANY],
            [op.ACCEPT_N, 1],
            [op.FAIL, expectedIndex]
          );
        }
      });
      generate2(ast2);
    }
    module2.exports = generateBytecode2;
  }
});

// ../../../node_modules/source-map-generator/lib/base64.js
var require_base64 = __commonJS({
  "../../../node_modules/source-map-generator/lib/base64.js"(exports2) {
    var intToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split(
      ""
    );
    exports2.encode = function(number) {
      if (0 <= number && number < intToCharMap.length) {
        return intToCharMap[number];
      }
      throw new TypeError("Must be between 0 and 63: " + number);
    };
  }
});

// ../../../node_modules/source-map-generator/lib/base64-vlq.js
var require_base64_vlq = __commonJS({
  "../../../node_modules/source-map-generator/lib/base64-vlq.js"(exports2) {
    var base642 = require_base64();
    var VLQ_BASE_SHIFT = 5;
    var VLQ_BASE = 1 << VLQ_BASE_SHIFT;
    var VLQ_BASE_MASK = VLQ_BASE - 1;
    var VLQ_CONTINUATION_BIT = VLQ_BASE;
    function toVLQSigned(aValue) {
      return aValue < 0 ? (-aValue << 1) + 1 : (aValue << 1) + 0;
    }
    exports2.encode = function base64VLQ_encode(aValue) {
      let encoded = "";
      let digit;
      let vlq = toVLQSigned(aValue);
      do {
        digit = vlq & VLQ_BASE_MASK;
        vlq >>>= VLQ_BASE_SHIFT;
        if (vlq > 0) {
          digit |= VLQ_CONTINUATION_BIT;
        }
        encoded += base642.encode(digit);
      } while (vlq > 0);
      return encoded;
    };
  }
});

// ../../../node_modules/source-map-generator/lib/util.js
var require_util = __commonJS({
  "../../../node_modules/source-map-generator/lib/util.js"(exports2) {
    function getArg(aArgs, aName, aDefaultValue) {
      if (aName in aArgs) {
        return aArgs[aName];
      } else if (arguments.length === 3) {
        return aDefaultValue;
      }
      throw new Error('"' + aName + '" is a required argument.');
    }
    exports2.getArg = getArg;
    var supportsNullProto = (function() {
      const obj = /* @__PURE__ */ Object.create(null);
      return !("__proto__" in obj);
    })();
    function identity(s) {
      return s;
    }
    function toSetString(aStr) {
      if (isProtoString(aStr)) {
        return "$" + aStr;
      }
      return aStr;
    }
    exports2.toSetString = supportsNullProto ? identity : toSetString;
    function fromSetString(aStr) {
      if (isProtoString(aStr)) {
        return aStr.slice(1);
      }
      return aStr;
    }
    exports2.fromSetString = supportsNullProto ? identity : fromSetString;
    function isProtoString(s) {
      if (!s) {
        return false;
      }
      const length = s.length;
      if (length < 9) {
        return false;
      }
      if (s.charCodeAt(length - 1) !== 95 || s.charCodeAt(length - 2) !== 95 || s.charCodeAt(length - 3) !== 111 || s.charCodeAt(length - 4) !== 116 || s.charCodeAt(length - 5) !== 111 || s.charCodeAt(length - 6) !== 114 || s.charCodeAt(length - 7) !== 112 || s.charCodeAt(length - 8) !== 95 || s.charCodeAt(length - 9) !== 95) {
        return false;
      }
      for (let i = length - 10; i >= 0; i--) {
        if (s.charCodeAt(i) !== 36) {
          return false;
        }
      }
      return true;
    }
    function strcmp(aStr1, aStr2) {
      if (aStr1 === aStr2) {
        return 0;
      }
      if (aStr1 === null) {
        return 1;
      }
      if (aStr2 === null) {
        return -1;
      }
      if (aStr1 > aStr2) {
        return 1;
      }
      return -1;
    }
    function compareByGeneratedPositionsInflated(mappingA, mappingB) {
      let cmp = mappingA.generatedLine - mappingB.generatedLine;
      if (cmp !== 0) {
        return cmp;
      }
      cmp = mappingA.generatedColumn - mappingB.generatedColumn;
      if (cmp !== 0) {
        return cmp;
      }
      cmp = strcmp(mappingA.source, mappingB.source);
      if (cmp !== 0) {
        return cmp;
      }
      cmp = mappingA.originalLine - mappingB.originalLine;
      if (cmp !== 0) {
        return cmp;
      }
      cmp = mappingA.originalColumn - mappingB.originalColumn;
      if (cmp !== 0) {
        return cmp;
      }
      return strcmp(mappingA.name, mappingB.name);
    }
    exports2.compareByGeneratedPositionsInflated = compareByGeneratedPositionsInflated;
    var PROTOCOL = "http:";
    var PROTOCOL_AND_HOST = `${PROTOCOL}//host`;
    function createSafeHandler(cb) {
      return (input) => {
        const type = getURLType(input);
        const base = buildSafeBase(input);
        const url = new URL(input, base);
        cb(url);
        const result = url.toString();
        if (type === "absolute") {
          return result;
        } else if (type === "scheme-relative") {
          return result.slice(PROTOCOL.length);
        } else if (type === "path-absolute") {
          return result.slice(PROTOCOL_AND_HOST.length);
        }
        return computeRelativeURL(base, result);
      };
    }
    function withBase(url, base) {
      return new URL(url, base).toString();
    }
    function buildUniqueSegment(prefix, str) {
      let id = 0;
      do {
        const ident = prefix + id++;
        if (str.indexOf(ident) === -1) return ident;
      } while (true);
    }
    function buildSafeBase(str) {
      const maxDotParts = str.split("..").length - 1;
      const segment = buildUniqueSegment("p", str);
      let base = `${PROTOCOL_AND_HOST}/`;
      for (let i = 0; i < maxDotParts; i++) {
        base += `${segment}/`;
      }
      return base;
    }
    var ABSOLUTE_SCHEME = /^[A-Za-z0-9\+\-\.]+:/;
    function getURLType(url) {
      if (url[0] === "/") {
        if (url[1] === "/") return "scheme-relative";
        return "path-absolute";
      }
      return ABSOLUTE_SCHEME.test(url) ? "absolute" : "path-relative";
    }
    function computeRelativeURL(rootURL, targetURL) {
      if (typeof rootURL === "string") rootURL = new URL(rootURL);
      if (typeof targetURL === "string") targetURL = new URL(targetURL);
      const targetParts = targetURL.pathname.split("/");
      const rootParts = rootURL.pathname.split("/");
      if (rootParts.length > 0 && !rootParts[rootParts.length - 1]) {
        rootParts.pop();
      }
      while (targetParts.length > 0 && rootParts.length > 0 && targetParts[0] === rootParts[0]) {
        targetParts.shift();
        rootParts.shift();
      }
      const relativePath = rootParts.map(() => "..").concat(targetParts).join("/");
      return relativePath + targetURL.search + targetURL.hash;
    }
    var ensureDirectory = createSafeHandler((url) => {
      url.pathname = url.pathname.replace(/\/?$/, "/");
    });
    var normalize = createSafeHandler((url) => {
    });
    exports2.normalize = normalize;
    function join(aRoot, aPath) {
      const pathType = getURLType(aPath);
      const rootType = getURLType(aRoot);
      aRoot = ensureDirectory(aRoot);
      if (pathType === "absolute") {
        return withBase(aPath, void 0);
      }
      if (rootType === "absolute") {
        return withBase(aPath, aRoot);
      }
      if (pathType === "scheme-relative") {
        return normalize(aPath);
      }
      if (rootType === "scheme-relative") {
        return withBase(aPath, withBase(aRoot, PROTOCOL_AND_HOST)).slice(
          PROTOCOL.length
        );
      }
      if (pathType === "path-absolute") {
        return normalize(aPath);
      }
      if (rootType === "path-absolute") {
        return withBase(aPath, withBase(aRoot, PROTOCOL_AND_HOST)).slice(
          PROTOCOL_AND_HOST.length
        );
      }
      const base = buildSafeBase(aPath + aRoot);
      const newPath = withBase(aPath, withBase(aRoot, base));
      return computeRelativeURL(base, newPath);
    }
    exports2.join = join;
    function relative(rootURL, targetURL) {
      const result = relativeIfPossible(rootURL, targetURL);
      return typeof result === "string" ? result : normalize(targetURL);
    }
    exports2.relative = relative;
    function relativeIfPossible(rootURL, targetURL) {
      const urlType = getURLType(rootURL);
      if (urlType !== getURLType(targetURL)) {
        return null;
      }
      const base = buildSafeBase(rootURL + targetURL);
      const root = new URL(rootURL, base);
      const target = new URL(targetURL, base);
      try {
        new URL("", target.toString());
      } catch (err) {
        return null;
      }
      if (target.protocol !== root.protocol || target.user !== root.user || target.password !== root.password || target.hostname !== root.hostname || target.port !== root.port) {
        return null;
      }
      return computeRelativeURL(root, target);
    }
  }
});

// ../../../node_modules/source-map-generator/lib/array-set.js
var require_array_set = __commonJS({
  "../../../node_modules/source-map-generator/lib/array-set.js"(exports2) {
    var ArraySet = class _ArraySet {
      constructor() {
        this._array = [];
        this._set = /* @__PURE__ */ new Map();
      }
      /**
       * Static method for creating ArraySet instances from an existing array.
       */
      static fromArray(aArray, aAllowDuplicates) {
        const set = new _ArraySet();
        for (let i = 0, len = aArray.length; i < len; i++) {
          set.add(aArray[i], aAllowDuplicates);
        }
        return set;
      }
      /**
       * Return how many unique items are in this ArraySet. If duplicates have been
       * added, than those do not count towards the size.
       *
       * @returns Number
       */
      size() {
        return this._set.size;
      }
      /**
       * Add the given string to this set.
       *
       * @param String aStr
       */
      add(aStr, aAllowDuplicates) {
        const isDuplicate = this.has(aStr);
        const idx = this._array.length;
        if (!isDuplicate || aAllowDuplicates) {
          this._array.push(aStr);
        }
        if (!isDuplicate) {
          this._set.set(aStr, idx);
        }
      }
      /**
       * Is the given string a member of this set?
       *
       * @param String aStr
       */
      has(aStr) {
        return this._set.has(aStr);
      }
      /**
       * What is the index of the given string in the array?
       *
       * @param String aStr
       */
      indexOf(aStr) {
        const idx = this._set.get(aStr);
        if (idx >= 0) {
          return idx;
        }
        throw new Error('"' + aStr + '" is not in the set.');
      }
      /**
       * What is the element at the given index?
       *
       * @param Number aIdx
       */
      at(aIdx) {
        if (aIdx >= 0 && aIdx < this._array.length) {
          return this._array[aIdx];
        }
        throw new Error("No element indexed by " + aIdx);
      }
      /**
       * Returns the array representation of this set (which has the proper indices
       * indicated by indexOf). Note that this is a copy of the internal array used
       * for storing the members so that no one can mess with internal state.
       */
      toArray() {
        return this._array.slice();
      }
    };
    exports2.ArraySet = ArraySet;
  }
});

// ../../../node_modules/source-map-generator/lib/mapping-list.js
var require_mapping_list = __commonJS({
  "../../../node_modules/source-map-generator/lib/mapping-list.js"(exports2) {
    var util = require_util();
    function generatedPositionAfter(mappingA, mappingB) {
      const lineA = mappingA.generatedLine;
      const lineB = mappingB.generatedLine;
      const columnA = mappingA.generatedColumn;
      const columnB = mappingB.generatedColumn;
      return lineB > lineA || lineB == lineA && columnB >= columnA || util.compareByGeneratedPositionsInflated(mappingA, mappingB) <= 0;
    }
    var MappingList = class {
      constructor() {
        this._array = [];
        this._sorted = true;
        this._last = { generatedLine: -1, generatedColumn: 0 };
      }
      /**
       * Iterate through internal items. This method takes the same arguments that
       * `Array.prototype.forEach` takes.
       *
       * NOTE: The order of the mappings is NOT guaranteed.
       */
      unsortedForEach(aCallback, aThisArg) {
        this._array.forEach(aCallback, aThisArg);
      }
      /**
       * Add the given source mapping.
       *
       * @param Object aMapping
       */
      add(aMapping) {
        if (generatedPositionAfter(this._last, aMapping)) {
          this._last = aMapping;
          this._array.push(aMapping);
        } else {
          this._sorted = false;
          this._array.push(aMapping);
        }
      }
      /**
       * Returns the flat, sorted array of mappings. The mappings are sorted by
       * generated position.
       *
       * WARNING: This method returns internal data without copying, for
       * performance. The return value must NOT be mutated, and should be treated as
       * an immutable borrow. If you want to take ownership, you must make your own
       * copy.
       */
      toArray() {
        if (!this._sorted) {
          this._array.sort(util.compareByGeneratedPositionsInflated);
          this._sorted = true;
        }
        return this._array;
      }
    };
    exports2.MappingList = MappingList;
  }
});

// ../../../node_modules/source-map-generator/lib/source-map-generator.js
var require_source_map_generator = __commonJS({
  "../../../node_modules/source-map-generator/lib/source-map-generator.js"(exports2) {
    var base64VLQ = require_base64_vlq();
    var util = require_util();
    var ArraySet = require_array_set().ArraySet;
    var MappingList = require_mapping_list().MappingList;
    var SourceMapGenerator = class _SourceMapGenerator {
      constructor(aArgs) {
        if (!aArgs) {
          aArgs = {};
        }
        this._file = util.getArg(aArgs, "file", null);
        this._sourceRoot = util.getArg(aArgs, "sourceRoot", null);
        this._skipValidation = util.getArg(aArgs, "skipValidation", false);
        this._sources = new ArraySet();
        this._names = new ArraySet();
        this._mappings = new MappingList();
        this._sourcesContents = null;
      }
      /**
       * Creates a new SourceMapGenerator based on a SourceMapConsumer
       *
       * @param aSourceMapConsumer The SourceMap.
       */
      static fromSourceMap(aSourceMapConsumer) {
        const sourceRoot = aSourceMapConsumer.sourceRoot;
        const generator = new _SourceMapGenerator({
          file: aSourceMapConsumer.file,
          sourceRoot
        });
        aSourceMapConsumer.eachMapping(function(mapping) {
          const newMapping = {
            generated: {
              line: mapping.generatedLine,
              column: mapping.generatedColumn
            }
          };
          if (mapping.source != null) {
            newMapping.source = mapping.source;
            if (sourceRoot != null) {
              newMapping.source = util.relative(sourceRoot, newMapping.source);
            }
            newMapping.original = {
              line: mapping.originalLine,
              column: mapping.originalColumn
            };
            if (mapping.name != null) {
              newMapping.name = mapping.name;
            }
          }
          generator.addMapping(newMapping);
        });
        aSourceMapConsumer.sources.forEach(function(sourceFile) {
          let sourceRelative = sourceFile;
          if (sourceRoot != null) {
            sourceRelative = util.relative(sourceRoot, sourceFile);
          }
          if (!generator._sources.has(sourceRelative)) {
            generator._sources.add(sourceRelative);
          }
          const content = aSourceMapConsumer.sourceContentFor(sourceFile);
          if (content != null) {
            generator.setSourceContent(sourceFile, content);
          }
        });
        return generator;
      }
      /**
       * Add a single mapping from original source line and column to the generated
       * source's line and column for this source map being created. The mapping
       * object should have the following properties:
       *
       *   - generated: An object with the generated line and column positions.
       *   - original: An object with the original line and column positions.
       *   - source: The original source file (relative to the sourceRoot).
       *   - name: An optional original token name for this mapping.
       */
      addMapping(aArgs) {
        const generated = util.getArg(aArgs, "generated");
        const original = util.getArg(aArgs, "original", null);
        let source = util.getArg(aArgs, "source", null);
        let name = util.getArg(aArgs, "name", null);
        if (!this._skipValidation) {
          this._validateMapping(generated, original, source, name);
        }
        if (source != null) {
          source = String(source);
          if (!this._sources.has(source)) {
            this._sources.add(source);
          }
        }
        if (name != null) {
          name = String(name);
          if (!this._names.has(name)) {
            this._names.add(name);
          }
        }
        this._mappings.add({
          generatedLine: generated.line,
          generatedColumn: generated.column,
          originalLine: original && original.line,
          originalColumn: original && original.column,
          source,
          name
        });
      }
      /**
       * Set the source content for a source file.
       */
      setSourceContent(aSourceFile, aSourceContent) {
        let source = aSourceFile;
        if (this._sourceRoot != null) {
          source = util.relative(this._sourceRoot, source);
        }
        if (aSourceContent != null) {
          if (!this._sourcesContents) {
            this._sourcesContents = /* @__PURE__ */ Object.create(null);
          }
          this._sourcesContents[util.toSetString(source)] = aSourceContent;
        } else if (this._sourcesContents) {
          delete this._sourcesContents[util.toSetString(source)];
          if (Object.keys(this._sourcesContents).length === 0) {
            this._sourcesContents = null;
          }
        }
      }
      /**
       * Applies the mappings of a sub-source-map for a specific source file to the
       * source map being generated. Each mapping to the supplied source file is
       * rewritten using the supplied source map. Note: The resolution for the
       * resulting mappings is the minimium of this map and the supplied map.
       *
       * @param aSourceMapConsumer The source map to be applied.
       * @param aSourceFile Optional. The filename of the source file.
       *        If omitted, SourceMapConsumer's file property will be used.
       * @param aSourceMapPath Optional. The dirname of the path to the source map
       *        to be applied. If relative, it is relative to the SourceMapConsumer.
       *        This parameter is needed when the two source maps aren't in the same
       *        directory, and the source map to be applied contains relative source
       *        paths. If so, those relative source paths need to be rewritten
       *        relative to the SourceMapGenerator.
       */
      applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
        let sourceFile = aSourceFile;
        if (aSourceFile == null) {
          if (aSourceMapConsumer.file == null) {
            throw new Error(
              `SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, or the source map's "file" property. Both were omitted.`
            );
          }
          sourceFile = aSourceMapConsumer.file;
        }
        const sourceRoot = this._sourceRoot;
        if (sourceRoot != null) {
          sourceFile = util.relative(sourceRoot, sourceFile);
        }
        const newSources = this._mappings.toArray().length > 0 ? new ArraySet() : this._sources;
        const newNames = new ArraySet();
        this._mappings.unsortedForEach(function(mapping) {
          if (mapping.source === sourceFile && mapping.originalLine != null) {
            const original = aSourceMapConsumer.originalPositionFor({
              line: mapping.originalLine,
              column: mapping.originalColumn
            });
            if (original.source != null) {
              mapping.source = original.source;
              if (aSourceMapPath != null) {
                mapping.source = util.join(aSourceMapPath, mapping.source);
              }
              if (sourceRoot != null) {
                mapping.source = util.relative(sourceRoot, mapping.source);
              }
              mapping.originalLine = original.line;
              mapping.originalColumn = original.column;
              if (original.name != null) {
                mapping.name = original.name;
              }
            }
          }
          const source = mapping.source;
          if (source != null && !newSources.has(source)) {
            newSources.add(source);
          }
          const name = mapping.name;
          if (name != null && !newNames.has(name)) {
            newNames.add(name);
          }
        }, this);
        this._sources = newSources;
        this._names = newNames;
        aSourceMapConsumer.sources.forEach(function(srcFile) {
          const content = aSourceMapConsumer.sourceContentFor(srcFile);
          if (content != null) {
            if (aSourceMapPath != null) {
              srcFile = util.join(aSourceMapPath, srcFile);
            }
            if (sourceRoot != null) {
              srcFile = util.relative(sourceRoot, srcFile);
            }
            this.setSourceContent(srcFile, content);
          }
        }, this);
      }
      /**
       * A mapping can have one of the three levels of data:
       *
       *   1. Just the generated position.
       *   2. The Generated position, original position, and original source.
       *   3. Generated and original position, original source, as well as a name
       *      token.
       *
       * To maintain consistency, we validate that any new mapping being added falls
       * in to one of these categories.
       */
      _validateMapping(aGenerated, aOriginal, aSource, aName) {
        if (aOriginal && typeof aOriginal.line !== "number" && typeof aOriginal.column !== "number") {
          throw new Error(
            "original.line and original.column are not numbers -- you probably meant to omit the original mapping entirely and only map the generated position. If so, pass null for the original mapping instead of an object with empty or null values."
          );
        }
        if (aGenerated && "line" in aGenerated && "column" in aGenerated && aGenerated.line > 0 && aGenerated.column >= 0 && !aOriginal && !aSource && !aName) {
        } else if (aGenerated && "line" in aGenerated && "column" in aGenerated && aOriginal && "line" in aOriginal && "column" in aOriginal && aGenerated.line > 0 && aGenerated.column >= 0 && aOriginal.line > 0 && aOriginal.column >= 0 && aSource) {
        } else {
          throw new Error(
            "Invalid mapping: " + JSON.stringify({
              generated: aGenerated,
              source: aSource,
              original: aOriginal,
              name: aName
            })
          );
        }
      }
      /**
       * Serialize the accumulated mappings in to the stream of base 64 VLQs
       * specified by the source map format.
       */
      _serializeMappings() {
        let previousGeneratedColumn = 0;
        let previousGeneratedLine = 1;
        let previousOriginalColumn = 0;
        let previousOriginalLine = 0;
        let previousName = 0;
        let previousSource = 0;
        let result = "";
        let next;
        let mapping;
        let nameIdx;
        let sourceIdx;
        const mappings = this._mappings.toArray();
        for (let i = 0, len = mappings.length; i < len; i++) {
          mapping = mappings[i];
          next = "";
          if (mapping.generatedLine !== previousGeneratedLine) {
            previousGeneratedColumn = 0;
            while (mapping.generatedLine !== previousGeneratedLine) {
              next += ";";
              previousGeneratedLine++;
            }
          } else if (i > 0) {
            if (!util.compareByGeneratedPositionsInflated(mapping, mappings[i - 1])) {
              continue;
            }
            next += ",";
          }
          next += base64VLQ.encode(
            mapping.generatedColumn - previousGeneratedColumn
          );
          previousGeneratedColumn = mapping.generatedColumn;
          if (mapping.source != null) {
            sourceIdx = this._sources.indexOf(mapping.source);
            next += base64VLQ.encode(sourceIdx - previousSource);
            previousSource = sourceIdx;
            next += base64VLQ.encode(
              mapping.originalLine - 1 - previousOriginalLine
            );
            previousOriginalLine = mapping.originalLine - 1;
            next += base64VLQ.encode(
              mapping.originalColumn - previousOriginalColumn
            );
            previousOriginalColumn = mapping.originalColumn;
            if (mapping.name != null) {
              nameIdx = this._names.indexOf(mapping.name);
              next += base64VLQ.encode(nameIdx - previousName);
              previousName = nameIdx;
            }
          }
          result += next;
        }
        return result;
      }
      _generateSourcesContent(aSources, aSourceRoot) {
        return aSources.map(function(source) {
          if (!this._sourcesContents) {
            return null;
          }
          if (aSourceRoot != null) {
            source = util.relative(aSourceRoot, source);
          }
          const key = util.toSetString(source);
          return Object.prototype.hasOwnProperty.call(this._sourcesContents, key) ? this._sourcesContents[key] : null;
        }, this);
      }
      /**
       * Externalize the source map.
       */
      toJSON() {
        const map = {
          version: this._version,
          sources: this._sources.toArray(),
          names: this._names.toArray(),
          mappings: this._serializeMappings()
        };
        if (this._file != null) {
          map.file = this._file;
        }
        if (this._sourceRoot != null) {
          map.sourceRoot = this._sourceRoot;
        }
        if (this._sourcesContents) {
          map.sourcesContent = this._generateSourcesContent(
            map.sources,
            map.sourceRoot
          );
        }
        return map;
      }
      /**
       * Render the source map being generated to a string.
       */
      toString() {
        return JSON.stringify(this.toJSON());
      }
    };
    SourceMapGenerator.prototype._version = 3;
    exports2.SourceMapGenerator = SourceMapGenerator;
  }
});

// ../../../node_modules/source-map-generator/lib/source-node.js
var require_source_node = __commonJS({
  "../../../node_modules/source-map-generator/lib/source-node.js"(exports2) {
    var SourceMapGenerator = require_source_map_generator().SourceMapGenerator;
    var util = require_util();
    var REGEX_NEWLINE = /(\r?\n)/;
    var NEWLINE_CODE = 10;
    var isSourceNode = "$$$isSourceNode$$$";
    var SourceNode = class _SourceNode {
      constructor(aLine, aColumn, aSource, aChunks, aName) {
        this.children = [];
        this.sourceContents = {};
        this.line = aLine == null ? null : aLine;
        this.column = aColumn == null ? null : aColumn;
        this.source = aSource == null ? null : aSource;
        this.name = aName == null ? null : aName;
        this[isSourceNode] = true;
        if (aChunks != null) this.add(aChunks);
      }
      /**
       * Creates a SourceNode from generated code and a SourceMapConsumer.
       *
       * @param aGeneratedCode The generated code
       * @param aSourceMapConsumer The SourceMap for the generated code
       * @param aRelativePath Optional. The path that relative sources in the
       *        SourceMapConsumer should be relative to.
       */
      static fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
        const node = new _SourceNode();
        const remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
        let remainingLinesIndex = 0;
        const shiftNextLine = function() {
          const lineContents = getNextLine();
          const newLine = getNextLine() || "";
          return lineContents + newLine;
          function getNextLine() {
            return remainingLinesIndex < remainingLines.length ? remainingLines[remainingLinesIndex++] : void 0;
          }
        };
        let lastGeneratedLine = 1, lastGeneratedColumn = 0;
        let lastMapping = null;
        let nextLine;
        aSourceMapConsumer.eachMapping(function(mapping) {
          if (lastMapping !== null) {
            if (lastGeneratedLine < mapping.generatedLine) {
              addMappingWithCode(lastMapping, shiftNextLine());
              lastGeneratedLine++;
              lastGeneratedColumn = 0;
            } else {
              nextLine = remainingLines[remainingLinesIndex] || "";
              const code = nextLine.substr(
                0,
                mapping.generatedColumn - lastGeneratedColumn
              );
              remainingLines[remainingLinesIndex] = nextLine.substr(
                mapping.generatedColumn - lastGeneratedColumn
              );
              lastGeneratedColumn = mapping.generatedColumn;
              addMappingWithCode(lastMapping, code);
              lastMapping = mapping;
              return;
            }
          }
          while (lastGeneratedLine < mapping.generatedLine) {
            node.add(shiftNextLine());
            lastGeneratedLine++;
          }
          if (lastGeneratedColumn < mapping.generatedColumn) {
            nextLine = remainingLines[remainingLinesIndex] || "";
            node.add(nextLine.substr(0, mapping.generatedColumn));
            remainingLines[remainingLinesIndex] = nextLine.substr(
              mapping.generatedColumn
            );
            lastGeneratedColumn = mapping.generatedColumn;
          }
          lastMapping = mapping;
        }, this);
        if (remainingLinesIndex < remainingLines.length) {
          if (lastMapping) {
            addMappingWithCode(lastMapping, shiftNextLine());
          }
          node.add(remainingLines.splice(remainingLinesIndex).join(""));
        }
        aSourceMapConsumer.sources.forEach(function(sourceFile) {
          const content = aSourceMapConsumer.sourceContentFor(sourceFile);
          if (content != null) {
            if (aRelativePath != null) {
              sourceFile = util.join(aRelativePath, sourceFile);
            }
            node.setSourceContent(sourceFile, content);
          }
        });
        return node;
        function addMappingWithCode(mapping, code) {
          if (mapping === null || mapping.source === void 0) {
            node.add(code);
          } else {
            const source = aRelativePath ? util.join(aRelativePath, mapping.source) : mapping.source;
            node.add(
              new _SourceNode(
                mapping.originalLine,
                mapping.originalColumn,
                source,
                code,
                mapping.name
              )
            );
          }
        }
      }
      /**
       * Add a chunk of generated JS to this source node.
       *
       * @param aChunk A string snippet of generated JS code, another instance of
       *        SourceNode, or an array where each member is one of those things.
       */
      add(aChunk) {
        if (Array.isArray(aChunk)) {
          aChunk.forEach(function(chunk) {
            this.add(chunk);
          }, this);
        } else if (aChunk[isSourceNode] || typeof aChunk === "string") {
          if (aChunk) {
            this.children.push(aChunk);
          }
        } else {
          throw new TypeError(
            "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
          );
        }
        return this;
      }
      /**
       * Add a chunk of generated JS to the beginning of this source node.
       *
       * @param aChunk A string snippet of generated JS code, another instance of
       *        SourceNode, or an array where each member is one of those things.
       */
      prepend(aChunk) {
        if (Array.isArray(aChunk)) {
          for (let i = aChunk.length - 1; i >= 0; i--) {
            this.prepend(aChunk[i]);
          }
        } else if (aChunk[isSourceNode] || typeof aChunk === "string") {
          this.children.unshift(aChunk);
        } else {
          throw new TypeError(
            "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
          );
        }
        return this;
      }
      /**
       * Walk over the tree of JS snippets in this node and its children. The
       * walking function is called once for each snippet of JS and is passed that
       * snippet and the its original associated source's line/column location.
       *
       * @param aFn The traversal function.
       */
      walk(aFn) {
        let chunk;
        for (let i = 0, len = this.children.length; i < len; i++) {
          chunk = this.children[i];
          if (chunk[isSourceNode]) {
            chunk.walk(aFn);
          } else if (chunk !== "") {
            aFn(chunk, {
              source: this.source,
              line: this.line,
              column: this.column,
              name: this.name
            });
          }
        }
      }
      /**
       * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
       * each of `this.children`.
       *
       * @param aSep The separator.
       */
      join(aSep) {
        let newChildren;
        let i;
        const len = this.children.length;
        if (len > 0) {
          newChildren = [];
          for (i = 0; i < len - 1; i++) {
            newChildren.push(this.children[i]);
            newChildren.push(aSep);
          }
          newChildren.push(this.children[i]);
          this.children = newChildren;
        }
        return this;
      }
      /**
       * Call String.prototype.replace on the very right-most source snippet. Useful
       * for trimming whitespace from the end of a source node, etc.
       *
       * @param aPattern The pattern to replace.
       * @param aReplacement The thing to replace the pattern with.
       */
      replaceRight(aPattern, aReplacement) {
        const lastChild = this.children[this.children.length - 1];
        if (lastChild[isSourceNode]) {
          lastChild.replaceRight(aPattern, aReplacement);
        } else if (typeof lastChild === "string") {
          this.children[this.children.length - 1] = lastChild.replace(
            aPattern,
            aReplacement
          );
        } else {
          this.children.push("".replace(aPattern, aReplacement));
        }
        return this;
      }
      /**
       * Set the source content for a source file. This will be added to the SourceMapGenerator
       * in the sourcesContent field.
       *
       * @param aSourceFile The filename of the source file
       * @param aSourceContent The content of the source file
       */
      setSourceContent(aSourceFile, aSourceContent) {
        this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
      }
      /**
       * Walk over the tree of SourceNodes. The walking function is called for each
       * source file content and is passed the filename and source content.
       *
       * @param aFn The traversal function.
       */
      walkSourceContents(aFn) {
        for (let i = 0, len = this.children.length; i < len; i++) {
          if (this.children[i][isSourceNode]) {
            this.children[i].walkSourceContents(aFn);
          }
        }
        const sources = Object.keys(this.sourceContents);
        for (let i = 0, len = sources.length; i < len; i++) {
          aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
        }
      }
      /**
       * Return the string representation of this source node. Walks over the tree
       * and concatenates all the various snippets together to one string.
       */
      toString() {
        let str = "";
        this.walk(function(chunk) {
          str += chunk;
        });
        return str;
      }
      /**
       * Returns the string representation of this source node along with a source
       * map.
       */
      toStringWithSourceMap(aArgs) {
        const generated = {
          code: "",
          line: 1,
          column: 0
        };
        const map = new SourceMapGenerator(aArgs);
        let sourceMappingActive = false;
        let lastOriginalSource = null;
        let lastOriginalLine = null;
        let lastOriginalColumn = null;
        let lastOriginalName = null;
        this.walk(function(chunk, original) {
          generated.code += chunk;
          if (original.source !== null && original.line !== null && original.column !== null) {
            if (lastOriginalSource !== original.source || lastOriginalLine !== original.line || lastOriginalColumn !== original.column || lastOriginalName !== original.name) {
              map.addMapping({
                source: original.source,
                original: {
                  line: original.line,
                  column: original.column
                },
                generated: {
                  line: generated.line,
                  column: generated.column
                },
                name: original.name
              });
            }
            lastOriginalSource = original.source;
            lastOriginalLine = original.line;
            lastOriginalColumn = original.column;
            lastOriginalName = original.name;
            sourceMappingActive = true;
          } else if (sourceMappingActive) {
            map.addMapping({
              generated: {
                line: generated.line,
                column: generated.column
              }
            });
            lastOriginalSource = null;
            sourceMappingActive = false;
          }
          for (let idx = 0, length = chunk.length; idx < length; idx++) {
            if (chunk.charCodeAt(idx) === NEWLINE_CODE) {
              generated.line++;
              generated.column = 0;
              if (idx + 1 === length) {
                lastOriginalSource = null;
                sourceMappingActive = false;
              } else if (sourceMappingActive) {
                map.addMapping({
                  source: original.source,
                  original: {
                    line: original.line,
                    column: original.column
                  },
                  generated: {
                    line: generated.line,
                    column: generated.column
                  },
                  name: original.name
                });
              }
            } else {
              generated.column++;
            }
          }
        });
        this.walkSourceContents(function(sourceFile, sourceContent) {
          map.setSourceContent(sourceFile, sourceContent);
        });
        return { code: generated.code, map };
      }
    };
    exports2.SourceNode = SourceNode;
  }
});

// ../../../node_modules/source-map-generator/source-map.js
var require_source_map = __commonJS({
  "../../../node_modules/source-map-generator/source-map.js"(exports2) {
    exports2.SourceMapGenerator = require_source_map_generator().SourceMapGenerator;
    exports2.SourceNode = require_source_node().SourceNode;
  }
});

// ../../../node_modules/peggy/lib/compiler/stack.js
var require_stack = __commonJS({
  "../../../node_modules/peggy/lib/compiler/stack.js"(exports2, module2) {
    "use strict";
    var { SourceNode } = require_source_map();
    var GrammarLocation = require_grammar_location();
    var Stack = class _Stack {
      /**
       * Constructs the helper for tracking variable slots of the stack virtual machine
       *
       * @param {string} ruleName The name of rule that will be used in error messages
       * @param {string} varName The prefix for generated names of variables
       * @param {string} type The type of the variables. For JavaScript there are `var` or `let`
       * @param {number[]} bytecode Bytecode for error messages
       */
      constructor(ruleName, varName, type, bytecode) {
        this.sp = -1;
        this.maxSp = -1;
        this.varName = varName;
        this.ruleName = ruleName;
        this.type = type;
        this.bytecode = bytecode;
        this.labels = {};
        this.sourceMapStack = [];
      }
      /**
       * Returns name of the variable at the index `i`.
       *
       * @param {number} i Index for which name must be generated
       * @return {string} Generated name
       *
       * @throws {RangeError} If `i < 0`, which means a stack underflow (there are more `pop`s than `push`es)
       */
      name(i) {
        if (i < 0) {
          throw new RangeError(
            `Rule '${this.ruleName}': The variable stack underflow: attempt to use a variable '${this.varName}<x>' at an index ${i}.
Bytecode: ${this.bytecode}`
          );
        }
        return this.varName + i;
      }
      /**
       *
       * @param {PEG.LocationRange} location
       * @param {SourceArray} chunks
       * @param {string} [name]
       * @returns
       */
      static sourceNode(location, chunks, name) {
        const start = GrammarLocation.offsetStart(location);
        return new SourceNode(
          start.line,
          start.column ? start.column - 1 : null,
          String(location.source),
          chunks,
          name
        );
      }
      /**
       * Assigns `exprCode` to the new variable in the stack, returns generated code.
       * As the result, the size of a stack increases on 1.
       *
       * @param {string} exprCode Any expression code that must be assigned to the new variable in the stack
       * @return {string|SourceNode} Assignment code
       */
      push(exprCode) {
        if (++this.sp > this.maxSp) {
          this.maxSp = this.sp;
        }
        const label = this.labels[this.sp];
        const code = [this.name(this.sp), " = ", exprCode, ";"];
        if (label) {
          if (this.sourceMapStack.length) {
            const sourceNode = _Stack.sourceNode(
              label.location,
              code.splice(0, 2),
              label.label
            );
            const { parts, location } = this.sourceMapPopInternal();
            const newLoc = location.start.offset < label.location.end.offset ? {
              start: label.location.end,
              end: location.end,
              source: location.source
            } : location;
            const outerNode = _Stack.sourceNode(
              newLoc,
              code.concat("\n")
            );
            this.sourceMapStack.push([parts, parts.length + 1, location]);
            return new SourceNode(
              null,
              null,
              label.location.source,
              [sourceNode, outerNode]
            );
          } else {
            return _Stack.sourceNode(
              label.location,
              code.concat("\n")
            );
          }
        }
        return code.join("");
      }
      /**
       * @overload
       * @param {undefined} [n]
       * @return {string}
       */
      /**
       * @overload
       * @param {number} n
       * @return {string[]}
       */
      /**
       * Returns name or `n` names of the variable(s) from the top of the stack.
       *
       * @param {number} [n] Quantity of variables, which need to be removed from the stack
       * @returns {string[]|string} Generated name(s). If n is defined then it returns an
       *                            array of length `n`
       *
       * @throws {RangeError} If the stack underflow (there are more `pop`s than `push`es)
       */
      pop(n) {
        if (n !== void 0) {
          this.sp -= n;
          return Array.from({ length: n }, (v, i) => this.name(this.sp + 1 + i));
        }
        return this.name(this.sp--);
      }
      /**
       * Returns name of the first free variable. The same as `index(0)`.
       *
       * @return {string} Generated name
       *
       * @throws {RangeError} If the stack is empty (there was no `push`'s yet)
       */
      top() {
        return this.name(this.sp);
      }
      /**
       * Returns name of the variable at index `i`.
       *
       * @param {number} i Index of the variable from top of the stack
       * @return {string} Generated name
       *
       * @throws {RangeError} If `i < 0` or more than the stack size
       */
      index(i) {
        if (i < 0) {
          throw new RangeError(
            `Rule '${this.ruleName}': The variable stack overflow: attempt to get a variable at a negative index ${i}.
Bytecode: ${this.bytecode}`
          );
        }
        return this.name(this.sp - i);
      }
      /**
       * Returns variable name that contains result (bottom of the stack).
       *
       * @return {string} Generated name
       *
       * @throws {RangeError} If the stack is empty (there was no `push`es yet)
       */
      result() {
        if (this.maxSp < 0) {
          throw new RangeError(
            `Rule '${this.ruleName}': The variable stack is empty, can't get the result.
Bytecode: ${this.bytecode}`
          );
        }
        return this.name(0);
      }
      /**
       * Returns defines of all used variables.
       *
       * @return {string} Generated define variable expression with the type `this.type`.
       *         If the stack is empty, returns empty string
       */
      defines() {
        if (this.maxSp < 0) {
          return "";
        }
        return this.type + " " + Array.from({ length: this.maxSp + 1 }, (v, i) => this.name(i)).join(", ") + ";";
      }
      /**
       * Checks that code in the `generateIf` and `generateElse` move the stack pointer in the same way.
       *
       * @template T
       * @param {number} pos Opcode number for error messages
       * @param {() => T} generateIf First function that works with this stack
       * @param {(() => T)|null} [generateElse] Second function that works with this stack
       * @return {T[]}
       *
       * @throws {Error} If `generateElse` is defined and the stack pointer moved differently in the
       *         `generateIf` and `generateElse`
       */
      checkedIf(pos, generateIf, generateElse) {
        const baseSp = this.sp;
        const ifResult = generateIf();
        if (!generateElse) {
          return [ifResult];
        }
        const thenSp = this.sp;
        this.sp = baseSp;
        const elseResult = generateElse();
        if (thenSp !== this.sp) {
          throw new Error(
            "Rule '" + this.ruleName + "', position " + pos + ": Branches of a condition can't move the stack pointer differently (before: " + baseSp + ", after then: " + thenSp + ", after else: " + this.sp + "). Bytecode: " + this.bytecode
          );
        }
        return [ifResult, elseResult];
      }
      /**
       * Checks that code in the `generateBody` do not move stack pointer.
       *
       * @template T
       * @param {number} pos Opcode number for error messages
       * @param {() => T} generateBody Function that works with this stack
       * @return {T}
       *
       * @throws {Error} If `generateBody` move the stack pointer (if it contains unbalanced `push`es and `pop`s)
       */
      checkedLoop(pos, generateBody) {
        const baseSp = this.sp;
        const result = generateBody();
        if (baseSp !== this.sp) {
          throw new Error(
            "Rule '" + this.ruleName + "', position " + pos + ": Body of a loop can't move the stack pointer (before: " + baseSp + ", after: " + this.sp + "). Bytecode: " + this.bytecode
          );
        }
        return result;
      }
      /**
       *
       * @param {SourceArray} parts
       * @param {PEG.LocationRange} location
       */
      sourceMapPush(parts, location) {
        if (this.sourceMapStack.length) {
          const top = this.sourceMapStack[this.sourceMapStack.length - 1];
          if (top[2].start.offset === location.start.offset && top[2].end.offset > location.end.offset) {
            top[2] = {
              start: location.end,
              end: top[2].end,
              source: top[2].source
            };
          }
        }
        this.sourceMapStack.push([
          parts,
          parts.length,
          location
        ]);
      }
      /**
       * @returns {{parts:SourceArray,location:PEG.LocationRange}}
       */
      sourceMapPopInternal() {
        const elt = this.sourceMapStack.pop();
        if (!elt) {
          throw new RangeError(
            `Rule '${this.ruleName}': Attempting to pop an empty source map stack.
Bytecode: ${this.bytecode}`
          );
        }
        const [
          parts,
          index,
          location
        ] = elt;
        const chunks = parts.splice(index).map(
          (chunk) => chunk instanceof SourceNode ? chunk : chunk + "\n"
        );
        if (chunks.length) {
          const start = GrammarLocation.offsetStart(location);
          parts.push(new SourceNode(
            start.line,
            start.column - 1,
            String(location.source),
            chunks
          ));
        }
        return { parts, location };
      }
      /**
       * @param {number} [offset]
       * @returns {[SourceArray, number, PEG.LocationRange]|undefined}
       */
      sourceMapPop(offset) {
        const { location } = this.sourceMapPopInternal();
        if (this.sourceMapStack.length && location.end.offset < this.sourceMapStack[this.sourceMapStack.length - 1][2].end.offset) {
          const { parts, location: outer } = this.sourceMapPopInternal();
          const newLoc = outer.start.offset < location.end.offset ? {
            start: location.end,
            end: outer.end,
            source: outer.source
          } : outer;
          this.sourceMapStack.push([
            parts,
            parts.length + (offset || 0),
            newLoc
          ]);
        }
        return void 0;
      }
    };
    module2.exports = Stack;
  }
});

// ../../../node_modules/peggy/lib/version.js
var require_version = __commonJS({
  "../../../node_modules/peggy/lib/version.js"(exports2) {
    "use strict";
    exports2.version = "4.2.0";
  }
});

// ../../../node_modules/peggy/lib/compiler/utils.js
var require_utils = __commonJS({
  "../../../node_modules/peggy/lib/compiler/utils.js"(exports2) {
    "use strict";
    function hex(ch) {
      return ch.charCodeAt(0).toString(16).toUpperCase();
    }
    exports2.hex = hex;
    function stringEscape(s) {
      return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\0/g, "\\0").replace(/\x08/g, "\\b").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\v/g, "\\v").replace(/\f/g, "\\f").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, (ch) => "\\x0" + hex(ch)).replace(/[\x10-\x1F\x7F-\xFF]/g, (ch) => "\\x" + hex(ch)).replace(/[\u0100-\u0FFF]/g, (ch) => "\\u0" + hex(ch)).replace(/[\u1000-\uFFFF]/g, (ch) => "\\u" + hex(ch));
    }
    exports2.stringEscape = stringEscape;
    function regexpClassEscape(s) {
      return s.replace(/\\/g, "\\\\").replace(/\//g, "\\/").replace(/]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\x08/g, "\\b").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\v/g, "\\v").replace(/\f/g, "\\f").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, (ch) => "\\x0" + hex(ch)).replace(/[\x10-\x1F\x7F-\xFF]/g, (ch) => "\\x" + hex(ch)).replace(/[\u0100-\u0FFF]/g, (ch) => "\\u0" + hex(ch)).replace(/[\u1000-\uFFFF]/g, (ch) => "\\u" + hex(ch));
    }
    exports2.regexpClassEscape = regexpClassEscape;
    function base642(u8) {
      const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const rem = u8.length % 3;
      const len = u8.length - rem;
      let res = "";
      for (let i = 0; i < len; i += 3) {
        res += A[u8[i] >> 2];
        res += A[(u8[i] & 3) << 4 | u8[i + 1] >> 4];
        res += A[(u8[i + 1] & 15) << 2 | u8[i + 2] >> 6];
        res += A[u8[i + 2] & 63];
      }
      if (rem === 1) {
        res += A[u8[len] >> 2];
        res += A[(u8[len] & 3) << 4];
        res += "==";
      } else if (rem === 2) {
        res += A[u8[len] >> 2];
        res += A[(u8[len] & 3) << 4 | u8[len + 1] >> 4];
        res += A[(u8[len + 1] & 15) << 2];
        res += "=";
      }
      return res;
    }
    exports2.base64 = base642;
  }
});

// ../../../node_modules/peggy/lib/parser.js
var require_parser = __commonJS({
  "../../../node_modules/peggy/lib/parser.js"(exports2, module2) {
    "use strict";
    var OPS_TO_PREFIXED_TYPES = {
      "$": "text",
      "&": "simple_and",
      "!": "simple_not"
    };
    var OPS_TO_SUFFIXED_TYPES = {
      "?": "optional",
      "*": "zero_or_more",
      "+": "one_or_more"
    };
    var OPS_TO_SEMANTIC_PREDICATE_TYPES = {
      "&": "semantic_and",
      "!": "semantic_not"
    };
    function peg$subclass(child, parent) {
      function C() {
        this.constructor = child;
      }
      C.prototype = parent.prototype;
      child.prototype = new C();
    }
    function peg$SyntaxError(message, expected, found, location) {
      var self = Error.call(this, message);
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(self, peg$SyntaxError.prototype);
      }
      self.expected = expected;
      self.found = found;
      self.location = location;
      self.name = "SyntaxError";
      return self;
    }
    peg$subclass(peg$SyntaxError, Error);
    function peg$padEnd(str, targetLength, padString) {
      padString = padString || " ";
      if (str.length > targetLength) {
        return str;
      }
      targetLength -= str.length;
      padString += padString.repeat(targetLength);
      return str + padString.slice(0, targetLength);
    }
    peg$SyntaxError.prototype.format = function(sources) {
      var str = "Error: " + this.message;
      if (this.location) {
        var src = null;
        var k;
        for (k = 0; k < sources.length; k++) {
          if (sources[k].source === this.location.source) {
            src = sources[k].text.split(/\r\n|\n|\r/g);
            break;
          }
        }
        var s = this.location.start;
        var offset_s = this.location.source && typeof this.location.source.offset === "function" ? this.location.source.offset(s) : s;
        var loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
        if (src) {
          var e = this.location.end;
          var filler = peg$padEnd("", offset_s.line.toString().length, " ");
          var line = src[s.line - 1];
          var last = s.line === e.line ? e.column : line.length + 1;
          var hatLen = last - s.column || 1;
          str += "\n --> " + loc + "\n" + filler + " |\n" + offset_s.line + " | " + line + "\n" + filler + " | " + peg$padEnd("", s.column - 1, " ") + peg$padEnd("", hatLen, "^");
        } else {
          str += "\n at " + loc;
        }
      }
      return str;
    };
    peg$SyntaxError.buildMessage = function(expected, found) {
      var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return '"' + literalEscape(expectation.text) + '"';
        },
        class: function(expectation) {
          var escapedParts = expectation.parts.map(function(part) {
            return Array.isArray(part) ? classEscape(part[0]) + "-" + classEscape(part[1]) : classEscape(part);
          });
          return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]";
        },
        any: function() {
          return "any character";
        },
        end: function() {
          return "end of input";
        },
        other: function(expectation) {
          return expectation.description;
        }
      };
      function hex(ch) {
        return ch.charCodeAt(0).toString(16).toUpperCase();
      }
      function literalEscape(s) {
        return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
          return "\\x0" + hex(ch);
        }).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
          return "\\x" + hex(ch);
        });
      }
      function classEscape(s) {
        return s.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
          return "\\x0" + hex(ch);
        }).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
          return "\\x" + hex(ch);
        });
      }
      function describeExpectation(expectation) {
        return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
      }
      function describeExpected(expected2) {
        var descriptions = expected2.map(describeExpectation);
        var i, j;
        descriptions.sort();
        if (descriptions.length > 0) {
          for (i = 1, j = 1; i < descriptions.length; i++) {
            if (descriptions[i - 1] !== descriptions[i]) {
              descriptions[j] = descriptions[i];
              j++;
            }
          }
          descriptions.length = j;
        }
        switch (descriptions.length) {
          case 1:
            return descriptions[0];
          case 2:
            return descriptions[0] + " or " + descriptions[1];
          default:
            return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
        }
      }
      function describeFound(found2) {
        return found2 ? '"' + literalEscape(found2) + '"' : "end of input";
      }
      return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
    };
    function peg$parse(input, options2) {
      options2 = options2 !== void 0 ? options2 : {};
      var peg$FAILED = {};
      var peg$source = options2.grammarSource;
      var peg$startRuleFunctions = { Grammar: peg$parseGrammar, ImportsAndSource: peg$parseImportsAndSource };
      var peg$startRuleFunction = peg$parseGrammar;
      var peg$c0 = "import";
      var peg$c1 = ";";
      var peg$c2 = ",";
      var peg$c3 = "*";
      var peg$c4 = "as";
      var peg$c5 = "{";
      var peg$c6 = "}";
      var peg$c7 = "from";
      var peg$c8 = "=";
      var peg$c9 = "/";
      var peg$c10 = "@";
      var peg$c11 = ":";
      var peg$c12 = "|";
      var peg$c13 = "..";
      var peg$c14 = "(";
      var peg$c15 = ")";
      var peg$c16 = ".";
      var peg$c17 = "\n";
      var peg$c18 = "\r\n";
      var peg$c19 = "/*";
      var peg$c20 = "*/";
      var peg$c21 = "//";
      var peg$c22 = "\\";
      var peg$c23 = "i";
      var peg$c24 = '"';
      var peg$c25 = "'";
      var peg$c26 = "[";
      var peg$c27 = "^";
      var peg$c28 = "]";
      var peg$c29 = "-";
      var peg$c30 = "0";
      var peg$c31 = "b";
      var peg$c32 = "f";
      var peg$c33 = "n";
      var peg$c34 = "r";
      var peg$c35 = "t";
      var peg$c36 = "v";
      var peg$c37 = "x";
      var peg$c38 = "u";
      var peg$r0 = /^[!$&]/;
      var peg$r1 = /^[*-+?]/;
      var peg$r2 = /^[!&]/;
      var peg$r3 = /^[\t\v-\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/;
      var peg$r4 = /^[\n\r\u2028\u2029]/;
      var peg$r5 = /^[\r\u2028-\u2029]/;
      var peg$r6 = /^[A-Z_a-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376-\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E-\u066F\u0671-\u06D3\u06D5\u06E5-\u06E6\u06EE-\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4-\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC-\u09DD\u09DF-\u09E1\u09F0-\u09F1\u0A05-\u0A0A\u0A0F-\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32-\u0A33\u0A35-\u0A36\u0A38-\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2-\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0-\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32-\u0B33\u0B35-\u0B39\u0B3D\u0B5C-\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99-\u0B9A\u0B9C\u0B9E-\u0B9F\u0BA3-\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60-\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0-\u0CE1\u0CF1-\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32-\u0E33\u0E40-\u0E46\u0E81-\u0E82\u0E84\u0E87-\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA-\u0EAB\u0EAD-\u0EB0\u0EB2-\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065-\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE-\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5-\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A-\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5-\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40-\uFB41\uFB43-\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/;
      var peg$r7 = /^[$0-9_\u0300-\u036F\u0483-\u0487\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7\u0610-\u061A\u064B-\u0669\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u06F0-\u06F9\u0711\u0730-\u074A\u07A6-\u07B0\u07C0-\u07C9\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962-\u0963\u0966-\u096F\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7-\u09C8\u09CB-\u09CD\u09D7\u09E2-\u09E3\u09E6-\u09EF\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47-\u0A48\u0A4B-\u0A4D\u0A51\u0A66-\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47-\u0B48\u0B4B-\u0B4D\u0B56-\u0B57\u0B62-\u0B63\u0B66-\u0B6F\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55-\u0C56\u0C62-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5-\u0CD6\u0CE2-\u0CE3\u0CE6-\u0CEF\u0D01-\u0D03\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62-\u0D63\u0D66-\u0D6F\u0D82-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2-\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0E50-\u0E59\u0EB1\u0EB4-\u0EB9\u0EBB-\u0EBC\u0EC8-\u0ECD\u0ED0-\u0ED9\u0F18-\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F3F\u0F71-\u0F84\u0F86-\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1040-\u1049\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F-\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17B4-\u17D3\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u18A9\u1920-\u192B\u1930-\u193B\u1946-\u194F\u19D0-\u19D9\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AB0-\u1ABD\u1B00-\u1B04\u1B34-\u1B44\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BB0-\u1BB9\u1BE6-\u1BF3\u1C24-\u1C37\u1C40-\u1C49\u1C50-\u1C59\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF2-\u1CF4\u1CF8-\u1CF9\u1DC0-\u1DF5\u1DFC-\u1DFF\u200C-\u200D\u203F-\u2040\u2054\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099-\u309A\uA620-\uA629\uA66F\uA674-\uA67D\uA69E-\uA69F\uA6F0-\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880-\uA881\uA8B4-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F1\uA900-\uA909\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9D0-\uA9D9\uA9E5\uA9F0-\uA9F9\uAA29-\uAA36\uAA43\uAA4C-\uAA4D\uAA50-\uAA59\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7-\uAAB8\uAABE-\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5-\uAAF6\uABE3-\uABEA\uABEC-\uABED\uABF0-\uABF9\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\uFE33-\uFE34\uFE4D-\uFE4F\uFF10-\uFF19\uFF3F]/;
      var peg$r8 = /^[A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376-\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E-\u066F\u0671-\u06D3\u06D5\u06E5-\u06E6\u06EE-\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4-\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC-\u09DD\u09DF-\u09E1\u09F0-\u09F1\u0A05-\u0A0A\u0A0F-\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32-\u0A33\u0A35-\u0A36\u0A38-\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2-\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0-\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32-\u0B33\u0B35-\u0B39\u0B3D\u0B5C-\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99-\u0B9A\u0B9C\u0B9E-\u0B9F\u0BA3-\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60-\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0-\u0CE1\u0CF1-\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32-\u0E33\u0E40-\u0E46\u0E81-\u0E82\u0E84\u0E87-\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA-\u0EAB\u0EAD-\u0EB0\u0EB2-\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065-\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE-\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5-\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A-\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5-\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40-\uFB41\uFB43-\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/;
      var peg$r9 = /^[\u0300-\u036F\u0483-\u0487\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962-\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7-\u09C8\u09CB-\u09CD\u09D7\u09E2-\u09E3\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47-\u0A48\u0A4B-\u0A4D\u0A51\u0A70-\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2-\u0AE3\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47-\u0B48\u0B4B-\u0B4D\u0B56-\u0B57\u0B62-\u0B63\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C00-\u0C03\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55-\u0C56\u0C62-\u0C63\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5-\u0CD6\u0CE2-\u0CE3\u0D01-\u0D03\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62-\u0D63\u0D82-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2-\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB-\u0EBC\u0EC8-\u0ECD\u0F18-\u0F19\u0F35\u0F37\u0F39\u0F3E-\u0F3F\u0F71-\u0F84\u0F86-\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u192B\u1930-\u193B\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F\u1AB0-\u1ABD\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF2-\u1CF4\u1CF8-\u1CF9\u1DC0-\u1DF5\u1DFC-\u1DFF\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099-\u309A\uA66F\uA674-\uA67D\uA69E-\uA69F\uA6F0-\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880-\uA881\uA8B4-\uA8C4\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C-\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7-\uAAB8\uAABE-\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5-\uAAF6\uABE3-\uABEA\uABEC-\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F]/;
      var peg$r10 = /^[\n\r"\\\u2028-\u2029]/;
      var peg$r11 = /^[\n\r'\\\u2028-\u2029]/;
      var peg$r12 = /^[\n\r\\-\]\u2028-\u2029]/;
      var peg$r13 = /^["'\\]/;
      var peg$r14 = /^[0-9ux]/;
      var peg$r15 = /^[0-9]/;
      var peg$r16 = /^[0-9a-f]/i;
      var peg$r17 = /^[{}]/;
      var peg$r18 = /^[a-z\xB5\xDF-\xF6\xF8-\xFF\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0111\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0127\u0129\u012B\u012D\u012F\u0131\u0133\u0135\u0137-\u0138\u013A\u013C\u013E\u0140\u0142\u0144\u0146\u0148-\u0149\u014B\u014D\u014F\u0151\u0153\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0167\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\u017A\u017C\u017E-\u0180\u0183\u0185\u0188\u018C-\u018D\u0192\u0195\u0199-\u019B\u019E\u01A1\u01A3\u01A5\u01A8\u01AA-\u01AB\u01AD\u01B0\u01B4\u01B6\u01B9-\u01BA\u01BD-\u01BF\u01C6\u01C9\u01CC\u01CE\u01D0\u01D2\u01D4\u01D6\u01D8\u01DA\u01DC-\u01DD\u01DF\u01E1\u01E3\u01E5\u01E7\u01E9\u01EB\u01ED\u01EF-\u01F0\u01F3\u01F5\u01F9\u01FB\u01FD\u01FF\u0201\u0203\u0205\u0207\u0209\u020B\u020D\u020F\u0211\u0213\u0215\u0217\u0219\u021B\u021D\u021F\u0221\u0223\u0225\u0227\u0229\u022B\u022D\u022F\u0231\u0233-\u0239\u023C\u023F-\u0240\u0242\u0247\u0249\u024B\u024D\u024F-\u0293\u0295-\u02AF\u0371\u0373\u0377\u037B-\u037D\u0390\u03AC-\u03CE\u03D0-\u03D1\u03D5-\u03D7\u03D9\u03DB\u03DD\u03DF\u03E1\u03E3\u03E5\u03E7\u03E9\u03EB\u03ED\u03EF-\u03F3\u03F5\u03F8\u03FB-\u03FC\u0430-\u045F\u0461\u0463\u0465\u0467\u0469\u046B\u046D\u046F\u0471\u0473\u0475\u0477\u0479\u047B\u047D\u047F\u0481\u048B\u048D\u048F\u0491\u0493\u0495\u0497\u0499\u049B\u049D\u049F\u04A1\u04A3\u04A5\u04A7\u04A9\u04AB\u04AD\u04AF\u04B1\u04B3\u04B5\u04B7\u04B9\u04BB\u04BD\u04BF\u04C2\u04C4\u04C6\u04C8\u04CA\u04CC\u04CE-\u04CF\u04D1\u04D3\u04D5\u04D7\u04D9\u04DB\u04DD\u04DF\u04E1\u04E3\u04E5\u04E7\u04E9\u04EB\u04ED\u04EF\u04F1\u04F3\u04F5\u04F7\u04F9\u04FB\u04FD\u04FF\u0501\u0503\u0505\u0507\u0509\u050B\u050D\u050F\u0511\u0513\u0515\u0517\u0519\u051B\u051D\u051F\u0521\u0523\u0525\u0527\u0529\u052B\u052D\u052F\u0561-\u0587\u13F8-\u13FD\u1D00-\u1D2B\u1D6B-\u1D77\u1D79-\u1D9A\u1E01\u1E03\u1E05\u1E07\u1E09\u1E0B\u1E0D\u1E0F\u1E11\u1E13\u1E15\u1E17\u1E19\u1E1B\u1E1D\u1E1F\u1E21\u1E23\u1E25\u1E27\u1E29\u1E2B\u1E2D\u1E2F\u1E31\u1E33\u1E35\u1E37\u1E39\u1E3B\u1E3D\u1E3F\u1E41\u1E43\u1E45\u1E47\u1E49\u1E4B\u1E4D\u1E4F\u1E51\u1E53\u1E55\u1E57\u1E59\u1E5B\u1E5D\u1E5F\u1E61\u1E63\u1E65\u1E67\u1E69\u1E6B\u1E6D\u1E6F\u1E71\u1E73\u1E75\u1E77\u1E79\u1E7B\u1E7D\u1E7F\u1E81\u1E83\u1E85\u1E87\u1E89\u1E8B\u1E8D\u1E8F\u1E91\u1E93\u1E95-\u1E9D\u1E9F\u1EA1\u1EA3\u1EA5\u1EA7\u1EA9\u1EAB\u1EAD\u1EAF\u1EB1\u1EB3\u1EB5\u1EB7\u1EB9\u1EBB\u1EBD\u1EBF\u1EC1\u1EC3\u1EC5\u1EC7\u1EC9\u1ECB\u1ECD\u1ECF\u1ED1\u1ED3\u1ED5\u1ED7\u1ED9\u1EDB\u1EDD\u1EDF\u1EE1\u1EE3\u1EE5\u1EE7\u1EE9\u1EEB\u1EED\u1EEF\u1EF1\u1EF3\u1EF5\u1EF7\u1EF9\u1EFB\u1EFD\u1EFF-\u1F07\u1F10-\u1F15\u1F20-\u1F27\u1F30-\u1F37\u1F40-\u1F45\u1F50-\u1F57\u1F60-\u1F67\u1F70-\u1F7D\u1F80-\u1F87\u1F90-\u1F97\u1FA0-\u1FA7\u1FB0-\u1FB4\u1FB6-\u1FB7\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FC7\u1FD0-\u1FD3\u1FD6-\u1FD7\u1FE0-\u1FE7\u1FF2-\u1FF4\u1FF6-\u1FF7\u210A\u210E-\u210F\u2113\u212F\u2134\u2139\u213C-\u213D\u2146-\u2149\u214E\u2184\u2C30-\u2C5E\u2C61\u2C65-\u2C66\u2C68\u2C6A\u2C6C\u2C71\u2C73-\u2C74\u2C76-\u2C7B\u2C81\u2C83\u2C85\u2C87\u2C89\u2C8B\u2C8D\u2C8F\u2C91\u2C93\u2C95\u2C97\u2C99\u2C9B\u2C9D\u2C9F\u2CA1\u2CA3\u2CA5\u2CA7\u2CA9\u2CAB\u2CAD\u2CAF\u2CB1\u2CB3\u2CB5\u2CB7\u2CB9\u2CBB\u2CBD\u2CBF\u2CC1\u2CC3\u2CC5\u2CC7\u2CC9\u2CCB\u2CCD\u2CCF\u2CD1\u2CD3\u2CD5\u2CD7\u2CD9\u2CDB\u2CDD\u2CDF\u2CE1\u2CE3-\u2CE4\u2CEC\u2CEE\u2CF3\u2D00-\u2D25\u2D27\u2D2D\uA641\uA643\uA645\uA647\uA649\uA64B\uA64D\uA64F\uA651\uA653\uA655\uA657\uA659\uA65B\uA65D\uA65F\uA661\uA663\uA665\uA667\uA669\uA66B\uA66D\uA681\uA683\uA685\uA687\uA689\uA68B\uA68D\uA68F\uA691\uA693\uA695\uA697\uA699\uA69B\uA723\uA725\uA727\uA729\uA72B\uA72D\uA72F-\uA731\uA733\uA735\uA737\uA739\uA73B\uA73D\uA73F\uA741\uA743\uA745\uA747\uA749\uA74B\uA74D\uA74F\uA751\uA753\uA755\uA757\uA759\uA75B\uA75D\uA75F\uA761\uA763\uA765\uA767\uA769\uA76B\uA76D\uA76F\uA771-\uA778\uA77A\uA77C\uA77F\uA781\uA783\uA785\uA787\uA78C\uA78E\uA791\uA793-\uA795\uA797\uA799\uA79B\uA79D\uA79F\uA7A1\uA7A3\uA7A5\uA7A7\uA7A9\uA7B5\uA7B7\uA7FA\uAB30-\uAB5A\uAB60-\uAB65\uAB70-\uABBF\uFB00-\uFB06\uFB13-\uFB17\uFF41-\uFF5A]/;
      var peg$r19 = /^[\u02B0-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0374\u037A\u0559\u0640\u06E5-\u06E6\u07F4-\u07F5\u07FA\u081A\u0824\u0828\u0971\u0E46\u0EC6\u10FC\u17D7\u1843\u1AA7\u1C78-\u1C7D\u1D2C-\u1D6A\u1D78\u1D9B-\u1DBF\u2071\u207F\u2090-\u209C\u2C7C-\u2C7D\u2D6F\u2E2F\u3005\u3031-\u3035\u303B\u309D-\u309E\u30FC-\u30FE\uA015\uA4F8-\uA4FD\uA60C\uA67F\uA69C-\uA69D\uA717-\uA71F\uA770\uA788\uA7F8-\uA7F9\uA9CF\uA9E6\uAA70\uAADD\uAAF3-\uAAF4\uAB5C-\uAB5F\uFF70\uFF9E-\uFF9F]/;
      var peg$r20 = /^[\xAA\xBA\u01BB\u01C0-\u01C3\u0294\u05D0-\u05EA\u05F0-\u05F2\u0620-\u063F\u0641-\u064A\u066E-\u066F\u0671-\u06D3\u06D5\u06EE-\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u0800-\u0815\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0972-\u0980\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC-\u09DD\u09DF-\u09E1\u09F0-\u09F1\u0A05-\u0A0A\u0A0F-\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32-\u0A33\u0A35-\u0A36\u0A38-\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2-\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0-\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32-\u0B33\u0B35-\u0B39\u0B3D\u0B5C-\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99-\u0B9A\u0B9C\u0B9E-\u0B9F\u0BA3-\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60-\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0-\u0CE1\u0CF1-\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32-\u0E33\u0E40-\u0E45\u0E81-\u0E82\u0E84\u0E87-\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA-\u0EAB\u0EAD-\u0EB0\u0EB2-\u0EB3\u0EBD\u0EC0-\u0EC4\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065-\u1066\u106E-\u1070\u1075-\u1081\u108E\u10D0-\u10FA\u10FD-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17DC\u1820-\u1842\u1844-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE-\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C77\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5-\u1CF6\u2135-\u2138\u2D30-\u2D67\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3006\u303C\u3041-\u3096\u309F\u30A1-\u30FA\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA014\uA016-\uA48C\uA4D0-\uA4F7\uA500-\uA60B\uA610-\uA61F\uA62A-\uA62B\uA66E\uA6A0-\uA6E5\uA78F\uA7F7\uA7FB-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9E0-\uA9E4\uA9E7-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA6F\uAA71-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5-\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADC\uAAE0-\uAAEA\uAAF2\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40-\uFB41\uFB43-\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF66-\uFF6F\uFF71-\uFF9D\uFFA0-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/;
      var peg$r21 = /^[\u01C5\u01C8\u01CB\u01F2\u1F88-\u1F8F\u1F98-\u1F9F\u1FA8-\u1FAF\u1FBC\u1FCC\u1FFC]/;
      var peg$r22 = /^[A-Z\xC0-\xD6\xD8-\xDE\u0100\u0102\u0104\u0106\u0108\u010A\u010C\u010E\u0110\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u0128\u012A\u012C\u012E\u0130\u0132\u0134\u0136\u0139\u013B\u013D\u013F\u0141\u0143\u0145\u0147\u014A\u014C\u014E\u0150\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u0176\u0178-\u0179\u017B\u017D\u0181-\u0182\u0184\u0186-\u0187\u0189-\u018B\u018E-\u0191\u0193-\u0194\u0196-\u0198\u019C-\u019D\u019F-\u01A0\u01A2\u01A4\u01A6-\u01A7\u01A9\u01AC\u01AE-\u01AF\u01B1-\u01B3\u01B5\u01B7-\u01B8\u01BC\u01C4\u01C7\u01CA\u01CD\u01CF\u01D1\u01D3\u01D5\u01D7\u01D9\u01DB\u01DE\u01E0\u01E2\u01E4\u01E6\u01E8\u01EA\u01EC\u01EE\u01F1\u01F4\u01F6-\u01F8\u01FA\u01FC\u01FE\u0200\u0202\u0204\u0206\u0208\u020A\u020C\u020E\u0210\u0212\u0214\u0216\u0218\u021A\u021C\u021E\u0220\u0222\u0224\u0226\u0228\u022A\u022C\u022E\u0230\u0232\u023A-\u023B\u023D-\u023E\u0241\u0243-\u0246\u0248\u024A\u024C\u024E\u0370\u0372\u0376\u037F\u0386\u0388-\u038A\u038C\u038E-\u038F\u0391-\u03A1\u03A3-\u03AB\u03CF\u03D2-\u03D4\u03D8\u03DA\u03DC\u03DE\u03E0\u03E2\u03E4\u03E6\u03E8\u03EA\u03EC\u03EE\u03F4\u03F7\u03F9-\u03FA\u03FD-\u042F\u0460\u0462\u0464\u0466\u0468\u046A\u046C\u046E\u0470\u0472\u0474\u0476\u0478\u047A\u047C\u047E\u0480\u048A\u048C\u048E\u0490\u0492\u0494\u0496\u0498\u049A\u049C\u049E\u04A0\u04A2\u04A4\u04A6\u04A8\u04AA\u04AC\u04AE\u04B0\u04B2\u04B4\u04B6\u04B8\u04BA\u04BC\u04BE\u04C0-\u04C1\u04C3\u04C5\u04C7\u04C9\u04CB\u04CD\u04D0\u04D2\u04D4\u04D6\u04D8\u04DA\u04DC\u04DE\u04E0\u04E2\u04E4\u04E6\u04E8\u04EA\u04EC\u04EE\u04F0\u04F2\u04F4\u04F6\u04F8\u04FA\u04FC\u04FE\u0500\u0502\u0504\u0506\u0508\u050A\u050C\u050E\u0510\u0512\u0514\u0516\u0518\u051A\u051C\u051E\u0520\u0522\u0524\u0526\u0528\u052A\u052C\u052E\u0531-\u0556\u10A0-\u10C5\u10C7\u10CD\u13A0-\u13F5\u1E00\u1E02\u1E04\u1E06\u1E08\u1E0A\u1E0C\u1E0E\u1E10\u1E12\u1E14\u1E16\u1E18\u1E1A\u1E1C\u1E1E\u1E20\u1E22\u1E24\u1E26\u1E28\u1E2A\u1E2C\u1E2E\u1E30\u1E32\u1E34\u1E36\u1E38\u1E3A\u1E3C\u1E3E\u1E40\u1E42\u1E44\u1E46\u1E48\u1E4A\u1E4C\u1E4E\u1E50\u1E52\u1E54\u1E56\u1E58\u1E5A\u1E5C\u1E5E\u1E60\u1E62\u1E64\u1E66\u1E68\u1E6A\u1E6C\u1E6E\u1E70\u1E72\u1E74\u1E76\u1E78\u1E7A\u1E7C\u1E7E\u1E80\u1E82\u1E84\u1E86\u1E88\u1E8A\u1E8C\u1E8E\u1E90\u1E92\u1E94\u1E9E\u1EA0\u1EA2\u1EA4\u1EA6\u1EA8\u1EAA\u1EAC\u1EAE\u1EB0\u1EB2\u1EB4\u1EB6\u1EB8\u1EBA\u1EBC\u1EBE\u1EC0\u1EC2\u1EC4\u1EC6\u1EC8\u1ECA\u1ECC\u1ECE\u1ED0\u1ED2\u1ED4\u1ED6\u1ED8\u1EDA\u1EDC\u1EDE\u1EE0\u1EE2\u1EE4\u1EE6\u1EE8\u1EEA\u1EEC\u1EEE\u1EF0\u1EF2\u1EF4\u1EF6\u1EF8\u1EFA\u1EFC\u1EFE\u1F08-\u1F0F\u1F18-\u1F1D\u1F28-\u1F2F\u1F38-\u1F3F\u1F48-\u1F4D\u1F59\u1F5B\u1F5D\u1F5F\u1F68-\u1F6F\u1FB8-\u1FBB\u1FC8-\u1FCB\u1FD8-\u1FDB\u1FE8-\u1FEC\u1FF8-\u1FFB\u2102\u2107\u210B-\u210D\u2110-\u2112\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u2130-\u2133\u213E-\u213F\u2145\u2183\u2C00-\u2C2E\u2C60\u2C62-\u2C64\u2C67\u2C69\u2C6B\u2C6D-\u2C70\u2C72\u2C75\u2C7E-\u2C80\u2C82\u2C84\u2C86\u2C88\u2C8A\u2C8C\u2C8E\u2C90\u2C92\u2C94\u2C96\u2C98\u2C9A\u2C9C\u2C9E\u2CA0\u2CA2\u2CA4\u2CA6\u2CA8\u2CAA\u2CAC\u2CAE\u2CB0\u2CB2\u2CB4\u2CB6\u2CB8\u2CBA\u2CBC\u2CBE\u2CC0\u2CC2\u2CC4\u2CC6\u2CC8\u2CCA\u2CCC\u2CCE\u2CD0\u2CD2\u2CD4\u2CD6\u2CD8\u2CDA\u2CDC\u2CDE\u2CE0\u2CE2\u2CEB\u2CED\u2CF2\uA640\uA642\uA644\uA646\uA648\uA64A\uA64C\uA64E\uA650\uA652\uA654\uA656\uA658\uA65A\uA65C\uA65E\uA660\uA662\uA664\uA666\uA668\uA66A\uA66C\uA680\uA682\uA684\uA686\uA688\uA68A\uA68C\uA68E\uA690\uA692\uA694\uA696\uA698\uA69A\uA722\uA724\uA726\uA728\uA72A\uA72C\uA72E\uA732\uA734\uA736\uA738\uA73A\uA73C\uA73E\uA740\uA742\uA744\uA746\uA748\uA74A\uA74C\uA74E\uA750\uA752\uA754\uA756\uA758\uA75A\uA75C\uA75E\uA760\uA762\uA764\uA766\uA768\uA76A\uA76C\uA76E\uA779\uA77B\uA77D-\uA77E\uA780\uA782\uA784\uA786\uA78B\uA78D\uA790\uA792\uA796\uA798\uA79A\uA79C\uA79E\uA7A0\uA7A2\uA7A4\uA7A6\uA7A8\uA7AA-\uA7AD\uA7B0-\uA7B4\uA7B6\uFF21-\uFF3A]/;
      var peg$r23 = /^[\u0903\u093B\u093E-\u0940\u0949-\u094C\u094E-\u094F\u0982-\u0983\u09BE-\u09C0\u09C7-\u09C8\u09CB-\u09CC\u09D7\u0A03\u0A3E-\u0A40\u0A83\u0ABE-\u0AC0\u0AC9\u0ACB-\u0ACC\u0B02-\u0B03\u0B3E\u0B40\u0B47-\u0B48\u0B4B-\u0B4C\u0B57\u0BBE-\u0BBF\u0BC1-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCC\u0BD7\u0C01-\u0C03\u0C41-\u0C44\u0C82-\u0C83\u0CBE\u0CC0-\u0CC4\u0CC7-\u0CC8\u0CCA-\u0CCB\u0CD5-\u0CD6\u0D02-\u0D03\u0D3E-\u0D40\u0D46-\u0D48\u0D4A-\u0D4C\u0D57\u0D82-\u0D83\u0DCF-\u0DD1\u0DD8-\u0DDF\u0DF2-\u0DF3\u0F3E-\u0F3F\u0F7F\u102B-\u102C\u1031\u1038\u103B-\u103C\u1056-\u1057\u1062-\u1064\u1067-\u106D\u1083-\u1084\u1087-\u108C\u108F\u109A-\u109C\u17B6\u17BE-\u17C5\u17C7-\u17C8\u1923-\u1926\u1929-\u192B\u1930-\u1931\u1933-\u1938\u1A19-\u1A1A\u1A55\u1A57\u1A61\u1A63-\u1A64\u1A6D-\u1A72\u1B04\u1B35\u1B3B\u1B3D-\u1B41\u1B43-\u1B44\u1B82\u1BA1\u1BA6-\u1BA7\u1BAA\u1BE7\u1BEA-\u1BEC\u1BEE\u1BF2-\u1BF3\u1C24-\u1C2B\u1C34-\u1C35\u1CE1\u1CF2-\u1CF3\u302E-\u302F\uA823-\uA824\uA827\uA880-\uA881\uA8B4-\uA8C3\uA952-\uA953\uA983\uA9B4-\uA9B5\uA9BA-\uA9BB\uA9BD-\uA9C0\uAA2F-\uAA30\uAA33-\uAA34\uAA4D\uAA7B\uAA7D\uAAEB\uAAEE-\uAAEF\uAAF5\uABE3-\uABE4\uABE6-\uABE7\uABE9-\uABEA\uABEC]/;
      var peg$r24 = /^[\u0300-\u036F\u0483-\u0487\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08E3-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962-\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2-\u09E3\u0A01-\u0A02\u0A3C\u0A41-\u0A42\u0A47-\u0A48\u0A4B-\u0A4D\u0A51\u0A70-\u0A71\u0A75\u0A81-\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7-\u0AC8\u0ACD\u0AE2-\u0AE3\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B56\u0B62-\u0B63\u0B82\u0BC0\u0BCD\u0C00\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55-\u0C56\u0C62-\u0C63\u0C81\u0CBC\u0CBF\u0CC6\u0CCC-\u0CCD\u0CE2-\u0CE3\u0D01\u0D41-\u0D44\u0D4D\u0D62-\u0D63\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB-\u0EBC\u0EC8-\u0ECD\u0F18-\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86-\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039-\u103A\u103D-\u103E\u1058-\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085-\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17B4-\u17B5\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u1922\u1927-\u1928\u1932\u1939-\u193B\u1A17-\u1A18\u1A1B\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1AB0-\u1ABD\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80-\u1B81\u1BA2-\u1BA5\u1BA8-\u1BA9\u1BAB-\u1BAD\u1BE6\u1BE8-\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1CF4\u1CF8-\u1CF9\u1DC0-\u1DF5\u1DFC-\u1DFF\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302D\u3099-\u309A\uA66F\uA674-\uA67D\uA69E-\uA69F\uA6F0-\uA6F1\uA802\uA806\uA80B\uA825-\uA826\uA8C4\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uA9E5\uAA29-\uAA2E\uAA31-\uAA32\uAA35-\uAA36\uAA43\uAA4C\uAA7C\uAAB0\uAAB2-\uAAB4\uAAB7-\uAAB8\uAABE-\uAABF\uAAC1\uAAEC-\uAAED\uAAF6\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F]/;
      var peg$r25 = /^[0-9\u0660-\u0669\u06F0-\u06F9\u07C0-\u07C9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0DE6-\u0DEF\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u1090-\u1099\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\u1A80-\u1A89\u1A90-\u1A99\u1B50-\u1B59\u1BB0-\u1BB9\u1C40-\u1C49\u1C50-\u1C59\uA620-\uA629\uA8D0-\uA8D9\uA900-\uA909\uA9D0-\uA9D9\uA9F0-\uA9F9\uAA50-\uAA59\uABF0-\uABF9\uFF10-\uFF19]/;
      var peg$r26 = /^[\u16EE-\u16F0\u2160-\u2182\u2185-\u2188\u3007\u3021-\u3029\u3038-\u303A\uA6E6-\uA6EF]/;
      var peg$r27 = /^[_\u203F-\u2040\u2054\uFE33-\uFE34\uFE4D-\uFE4F\uFF3F]/;
      var peg$r28 = /^[ \xA0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
      var peg$e0 = peg$anyExpectation();
      var peg$e1 = peg$literalExpectation("import", false);
      var peg$e2 = peg$literalExpectation(";", false);
      var peg$e3 = peg$literalExpectation(",", false);
      var peg$e4 = peg$literalExpectation("*", false);
      var peg$e5 = peg$literalExpectation("as", false);
      var peg$e6 = peg$literalExpectation("{", false);
      var peg$e7 = peg$literalExpectation("}", false);
      var peg$e8 = peg$literalExpectation("from", false);
      var peg$e9 = peg$literalExpectation("=", false);
      var peg$e10 = peg$literalExpectation("/", false);
      var peg$e11 = peg$literalExpectation("@", false);
      var peg$e12 = peg$literalExpectation(":", false);
      var peg$e13 = peg$classExpectation(["!", "$", "&"], false, false);
      var peg$e14 = peg$classExpectation([["*", "+"], "?"], false, false);
      var peg$e15 = peg$literalExpectation("|", false);
      var peg$e16 = peg$literalExpectation("..", false);
      var peg$e17 = peg$literalExpectation("(", false);
      var peg$e18 = peg$literalExpectation(")", false);
      var peg$e19 = peg$literalExpectation(".", false);
      var peg$e20 = peg$classExpectation(["!", "&"], false, false);
      var peg$e21 = peg$otherExpectation("whitespace");
      var peg$e22 = peg$classExpectation(["	", ["\v", "\f"], " ", "\xA0", "\u1680", ["\u2000", "\u200A"], "\u202F", "\u205F", "\u3000", "\uFEFF"], false, false);
      var peg$e23 = peg$classExpectation(["\n", "\r", "\u2028", "\u2029"], false, false);
      var peg$e24 = peg$otherExpectation("end of line");
      var peg$e25 = peg$literalExpectation("\n", false);
      var peg$e26 = peg$literalExpectation("\r\n", false);
      var peg$e27 = peg$classExpectation(["\r", ["\u2028", "\u2029"]], false, false);
      var peg$e28 = peg$otherExpectation("comment");
      var peg$e29 = peg$literalExpectation("/*", false);
      var peg$e30 = peg$literalExpectation("*/", false);
      var peg$e31 = peg$literalExpectation("//", false);
      var peg$e32 = peg$otherExpectation("identifier");
      var peg$e33 = peg$classExpectation([["A", "Z"], "_", ["a", "z"], "\xAA", "\xB5", "\xBA", ["\xC0", "\xD6"], ["\xD8", "\xF6"], ["\xF8", "\u02C1"], ["\u02C6", "\u02D1"], ["\u02E0", "\u02E4"], "\u02EC", "\u02EE", ["\u0370", "\u0374"], ["\u0376", "\u0377"], ["\u037A", "\u037D"], "\u037F", "\u0386", ["\u0388", "\u038A"], "\u038C", ["\u038E", "\u03A1"], ["\u03A3", "\u03F5"], ["\u03F7", "\u0481"], ["\u048A", "\u052F"], ["\u0531", "\u0556"], "\u0559", ["\u0561", "\u0587"], ["\u05D0", "\u05EA"], ["\u05F0", "\u05F2"], ["\u0620", "\u064A"], ["\u066E", "\u066F"], ["\u0671", "\u06D3"], "\u06D5", ["\u06E5", "\u06E6"], ["\u06EE", "\u06EF"], ["\u06FA", "\u06FC"], "\u06FF", "\u0710", ["\u0712", "\u072F"], ["\u074D", "\u07A5"], "\u07B1", ["\u07CA", "\u07EA"], ["\u07F4", "\u07F5"], "\u07FA", ["\u0800", "\u0815"], "\u081A", "\u0824", "\u0828", ["\u0840", "\u0858"], ["\u08A0", "\u08B4"], ["\u0904", "\u0939"], "\u093D", "\u0950", ["\u0958", "\u0961"], ["\u0971", "\u0980"], ["\u0985", "\u098C"], ["\u098F", "\u0990"], ["\u0993", "\u09A8"], ["\u09AA", "\u09B0"], "\u09B2", ["\u09B6", "\u09B9"], "\u09BD", "\u09CE", ["\u09DC", "\u09DD"], ["\u09DF", "\u09E1"], ["\u09F0", "\u09F1"], ["\u0A05", "\u0A0A"], ["\u0A0F", "\u0A10"], ["\u0A13", "\u0A28"], ["\u0A2A", "\u0A30"], ["\u0A32", "\u0A33"], ["\u0A35", "\u0A36"], ["\u0A38", "\u0A39"], ["\u0A59", "\u0A5C"], "\u0A5E", ["\u0A72", "\u0A74"], ["\u0A85", "\u0A8D"], ["\u0A8F", "\u0A91"], ["\u0A93", "\u0AA8"], ["\u0AAA", "\u0AB0"], ["\u0AB2", "\u0AB3"], ["\u0AB5", "\u0AB9"], "\u0ABD", "\u0AD0", ["\u0AE0", "\u0AE1"], "\u0AF9", ["\u0B05", "\u0B0C"], ["\u0B0F", "\u0B10"], ["\u0B13", "\u0B28"], ["\u0B2A", "\u0B30"], ["\u0B32", "\u0B33"], ["\u0B35", "\u0B39"], "\u0B3D", ["\u0B5C", "\u0B5D"], ["\u0B5F", "\u0B61"], "\u0B71", "\u0B83", ["\u0B85", "\u0B8A"], ["\u0B8E", "\u0B90"], ["\u0B92", "\u0B95"], ["\u0B99", "\u0B9A"], "\u0B9C", ["\u0B9E", "\u0B9F"], ["\u0BA3", "\u0BA4"], ["\u0BA8", "\u0BAA"], ["\u0BAE", "\u0BB9"], "\u0BD0", ["\u0C05", "\u0C0C"], ["\u0C0E", "\u0C10"], ["\u0C12", "\u0C28"], ["\u0C2A", "\u0C39"], "\u0C3D", ["\u0C58", "\u0C5A"], ["\u0C60", "\u0C61"], ["\u0C85", "\u0C8C"], ["\u0C8E", "\u0C90"], ["\u0C92", "\u0CA8"], ["\u0CAA", "\u0CB3"], ["\u0CB5", "\u0CB9"], "\u0CBD", "\u0CDE", ["\u0CE0", "\u0CE1"], ["\u0CF1", "\u0CF2"], ["\u0D05", "\u0D0C"], ["\u0D0E", "\u0D10"], ["\u0D12", "\u0D3A"], "\u0D3D", "\u0D4E", ["\u0D5F", "\u0D61"], ["\u0D7A", "\u0D7F"], ["\u0D85", "\u0D96"], ["\u0D9A", "\u0DB1"], ["\u0DB3", "\u0DBB"], "\u0DBD", ["\u0DC0", "\u0DC6"], ["\u0E01", "\u0E30"], ["\u0E32", "\u0E33"], ["\u0E40", "\u0E46"], ["\u0E81", "\u0E82"], "\u0E84", ["\u0E87", "\u0E88"], "\u0E8A", "\u0E8D", ["\u0E94", "\u0E97"], ["\u0E99", "\u0E9F"], ["\u0EA1", "\u0EA3"], "\u0EA5", "\u0EA7", ["\u0EAA", "\u0EAB"], ["\u0EAD", "\u0EB0"], ["\u0EB2", "\u0EB3"], "\u0EBD", ["\u0EC0", "\u0EC4"], "\u0EC6", ["\u0EDC", "\u0EDF"], "\u0F00", ["\u0F40", "\u0F47"], ["\u0F49", "\u0F6C"], ["\u0F88", "\u0F8C"], ["\u1000", "\u102A"], "\u103F", ["\u1050", "\u1055"], ["\u105A", "\u105D"], "\u1061", ["\u1065", "\u1066"], ["\u106E", "\u1070"], ["\u1075", "\u1081"], "\u108E", ["\u10A0", "\u10C5"], "\u10C7", "\u10CD", ["\u10D0", "\u10FA"], ["\u10FC", "\u1248"], ["\u124A", "\u124D"], ["\u1250", "\u1256"], "\u1258", ["\u125A", "\u125D"], ["\u1260", "\u1288"], ["\u128A", "\u128D"], ["\u1290", "\u12B0"], ["\u12B2", "\u12B5"], ["\u12B8", "\u12BE"], "\u12C0", ["\u12C2", "\u12C5"], ["\u12C8", "\u12D6"], ["\u12D8", "\u1310"], ["\u1312", "\u1315"], ["\u1318", "\u135A"], ["\u1380", "\u138F"], ["\u13A0", "\u13F5"], ["\u13F8", "\u13FD"], ["\u1401", "\u166C"], ["\u166F", "\u167F"], ["\u1681", "\u169A"], ["\u16A0", "\u16EA"], ["\u16EE", "\u16F8"], ["\u1700", "\u170C"], ["\u170E", "\u1711"], ["\u1720", "\u1731"], ["\u1740", "\u1751"], ["\u1760", "\u176C"], ["\u176E", "\u1770"], ["\u1780", "\u17B3"], "\u17D7", "\u17DC", ["\u1820", "\u1877"], ["\u1880", "\u18A8"], "\u18AA", ["\u18B0", "\u18F5"], ["\u1900", "\u191E"], ["\u1950", "\u196D"], ["\u1970", "\u1974"], ["\u1980", "\u19AB"], ["\u19B0", "\u19C9"], ["\u1A00", "\u1A16"], ["\u1A20", "\u1A54"], "\u1AA7", ["\u1B05", "\u1B33"], ["\u1B45", "\u1B4B"], ["\u1B83", "\u1BA0"], ["\u1BAE", "\u1BAF"], ["\u1BBA", "\u1BE5"], ["\u1C00", "\u1C23"], ["\u1C4D", "\u1C4F"], ["\u1C5A", "\u1C7D"], ["\u1CE9", "\u1CEC"], ["\u1CEE", "\u1CF1"], ["\u1CF5", "\u1CF6"], ["\u1D00", "\u1DBF"], ["\u1E00", "\u1F15"], ["\u1F18", "\u1F1D"], ["\u1F20", "\u1F45"], ["\u1F48", "\u1F4D"], ["\u1F50", "\u1F57"], "\u1F59", "\u1F5B", "\u1F5D", ["\u1F5F", "\u1F7D"], ["\u1F80", "\u1FB4"], ["\u1FB6", "\u1FBC"], "\u1FBE", ["\u1FC2", "\u1FC4"], ["\u1FC6", "\u1FCC"], ["\u1FD0", "\u1FD3"], ["\u1FD6", "\u1FDB"], ["\u1FE0", "\u1FEC"], ["\u1FF2", "\u1FF4"], ["\u1FF6", "\u1FFC"], "\u2071", "\u207F", ["\u2090", "\u209C"], "\u2102", "\u2107", ["\u210A", "\u2113"], "\u2115", ["\u2119", "\u211D"], "\u2124", "\u2126", "\u2128", ["\u212A", "\u212D"], ["\u212F", "\u2139"], ["\u213C", "\u213F"], ["\u2145", "\u2149"], "\u214E", ["\u2160", "\u2188"], ["\u2C00", "\u2C2E"], ["\u2C30", "\u2C5E"], ["\u2C60", "\u2CE4"], ["\u2CEB", "\u2CEE"], ["\u2CF2", "\u2CF3"], ["\u2D00", "\u2D25"], "\u2D27", "\u2D2D", ["\u2D30", "\u2D67"], "\u2D6F", ["\u2D80", "\u2D96"], ["\u2DA0", "\u2DA6"], ["\u2DA8", "\u2DAE"], ["\u2DB0", "\u2DB6"], ["\u2DB8", "\u2DBE"], ["\u2DC0", "\u2DC6"], ["\u2DC8", "\u2DCE"], ["\u2DD0", "\u2DD6"], ["\u2DD8", "\u2DDE"], "\u2E2F", ["\u3005", "\u3007"], ["\u3021", "\u3029"], ["\u3031", "\u3035"], ["\u3038", "\u303C"], ["\u3041", "\u3096"], ["\u309D", "\u309F"], ["\u30A1", "\u30FA"], ["\u30FC", "\u30FF"], ["\u3105", "\u312D"], ["\u3131", "\u318E"], ["\u31A0", "\u31BA"], ["\u31F0", "\u31FF"], ["\u3400", "\u4DB5"], ["\u4E00", "\u9FD5"], ["\uA000", "\uA48C"], ["\uA4D0", "\uA4FD"], ["\uA500", "\uA60C"], ["\uA610", "\uA61F"], ["\uA62A", "\uA62B"], ["\uA640", "\uA66E"], ["\uA67F", "\uA69D"], ["\uA6A0", "\uA6EF"], ["\uA717", "\uA71F"], ["\uA722", "\uA788"], ["\uA78B", "\uA7AD"], ["\uA7B0", "\uA7B7"], ["\uA7F7", "\uA801"], ["\uA803", "\uA805"], ["\uA807", "\uA80A"], ["\uA80C", "\uA822"], ["\uA840", "\uA873"], ["\uA882", "\uA8B3"], ["\uA8F2", "\uA8F7"], "\uA8FB", "\uA8FD", ["\uA90A", "\uA925"], ["\uA930", "\uA946"], ["\uA960", "\uA97C"], ["\uA984", "\uA9B2"], "\uA9CF", ["\uA9E0", "\uA9E4"], ["\uA9E6", "\uA9EF"], ["\uA9FA", "\uA9FE"], ["\uAA00", "\uAA28"], ["\uAA40", "\uAA42"], ["\uAA44", "\uAA4B"], ["\uAA60", "\uAA76"], "\uAA7A", ["\uAA7E", "\uAAAF"], "\uAAB1", ["\uAAB5", "\uAAB6"], ["\uAAB9", "\uAABD"], "\uAAC0", "\uAAC2", ["\uAADB", "\uAADD"], ["\uAAE0", "\uAAEA"], ["\uAAF2", "\uAAF4"], ["\uAB01", "\uAB06"], ["\uAB09", "\uAB0E"], ["\uAB11", "\uAB16"], ["\uAB20", "\uAB26"], ["\uAB28", "\uAB2E"], ["\uAB30", "\uAB5A"], ["\uAB5C", "\uAB65"], ["\uAB70", "\uABE2"], ["\uAC00", "\uD7A3"], ["\uD7B0", "\uD7C6"], ["\uD7CB", "\uD7FB"], ["\uF900", "\uFA6D"], ["\uFA70", "\uFAD9"], ["\uFB00", "\uFB06"], ["\uFB13", "\uFB17"], "\uFB1D", ["\uFB1F", "\uFB28"], ["\uFB2A", "\uFB36"], ["\uFB38", "\uFB3C"], "\uFB3E", ["\uFB40", "\uFB41"], ["\uFB43", "\uFB44"], ["\uFB46", "\uFBB1"], ["\uFBD3", "\uFD3D"], ["\uFD50", "\uFD8F"], ["\uFD92", "\uFDC7"], ["\uFDF0", "\uFDFB"], ["\uFE70", "\uFE74"], ["\uFE76", "\uFEFC"], ["\uFF21", "\uFF3A"], ["\uFF41", "\uFF5A"], ["\uFF66", "\uFFBE"], ["\uFFC2", "\uFFC7"], ["\uFFCA", "\uFFCF"], ["\uFFD2", "\uFFD7"], ["\uFFDA", "\uFFDC"]], false, false);
      var peg$e34 = peg$literalExpectation("\\", false);
      var peg$e35 = peg$classExpectation(["$", ["0", "9"], "_", ["\u0300", "\u036F"], ["\u0483", "\u0487"], ["\u0591", "\u05BD"], "\u05BF", ["\u05C1", "\u05C2"], ["\u05C4", "\u05C5"], "\u05C7", ["\u0610", "\u061A"], ["\u064B", "\u0669"], "\u0670", ["\u06D6", "\u06DC"], ["\u06DF", "\u06E4"], ["\u06E7", "\u06E8"], ["\u06EA", "\u06ED"], ["\u06F0", "\u06F9"], "\u0711", ["\u0730", "\u074A"], ["\u07A6", "\u07B0"], ["\u07C0", "\u07C9"], ["\u07EB", "\u07F3"], ["\u0816", "\u0819"], ["\u081B", "\u0823"], ["\u0825", "\u0827"], ["\u0829", "\u082D"], ["\u0859", "\u085B"], ["\u08E3", "\u0903"], ["\u093A", "\u093C"], ["\u093E", "\u094F"], ["\u0951", "\u0957"], ["\u0962", "\u0963"], ["\u0966", "\u096F"], ["\u0981", "\u0983"], "\u09BC", ["\u09BE", "\u09C4"], ["\u09C7", "\u09C8"], ["\u09CB", "\u09CD"], "\u09D7", ["\u09E2", "\u09E3"], ["\u09E6", "\u09EF"], ["\u0A01", "\u0A03"], "\u0A3C", ["\u0A3E", "\u0A42"], ["\u0A47", "\u0A48"], ["\u0A4B", "\u0A4D"], "\u0A51", ["\u0A66", "\u0A71"], "\u0A75", ["\u0A81", "\u0A83"], "\u0ABC", ["\u0ABE", "\u0AC5"], ["\u0AC7", "\u0AC9"], ["\u0ACB", "\u0ACD"], ["\u0AE2", "\u0AE3"], ["\u0AE6", "\u0AEF"], ["\u0B01", "\u0B03"], "\u0B3C", ["\u0B3E", "\u0B44"], ["\u0B47", "\u0B48"], ["\u0B4B", "\u0B4D"], ["\u0B56", "\u0B57"], ["\u0B62", "\u0B63"], ["\u0B66", "\u0B6F"], "\u0B82", ["\u0BBE", "\u0BC2"], ["\u0BC6", "\u0BC8"], ["\u0BCA", "\u0BCD"], "\u0BD7", ["\u0BE6", "\u0BEF"], ["\u0C00", "\u0C03"], ["\u0C3E", "\u0C44"], ["\u0C46", "\u0C48"], ["\u0C4A", "\u0C4D"], ["\u0C55", "\u0C56"], ["\u0C62", "\u0C63"], ["\u0C66", "\u0C6F"], ["\u0C81", "\u0C83"], "\u0CBC", ["\u0CBE", "\u0CC4"], ["\u0CC6", "\u0CC8"], ["\u0CCA", "\u0CCD"], ["\u0CD5", "\u0CD6"], ["\u0CE2", "\u0CE3"], ["\u0CE6", "\u0CEF"], ["\u0D01", "\u0D03"], ["\u0D3E", "\u0D44"], ["\u0D46", "\u0D48"], ["\u0D4A", "\u0D4D"], "\u0D57", ["\u0D62", "\u0D63"], ["\u0D66", "\u0D6F"], ["\u0D82", "\u0D83"], "\u0DCA", ["\u0DCF", "\u0DD4"], "\u0DD6", ["\u0DD8", "\u0DDF"], ["\u0DE6", "\u0DEF"], ["\u0DF2", "\u0DF3"], "\u0E31", ["\u0E34", "\u0E3A"], ["\u0E47", "\u0E4E"], ["\u0E50", "\u0E59"], "\u0EB1", ["\u0EB4", "\u0EB9"], ["\u0EBB", "\u0EBC"], ["\u0EC8", "\u0ECD"], ["\u0ED0", "\u0ED9"], ["\u0F18", "\u0F19"], ["\u0F20", "\u0F29"], "\u0F35", "\u0F37", "\u0F39", ["\u0F3E", "\u0F3F"], ["\u0F71", "\u0F84"], ["\u0F86", "\u0F87"], ["\u0F8D", "\u0F97"], ["\u0F99", "\u0FBC"], "\u0FC6", ["\u102B", "\u103E"], ["\u1040", "\u1049"], ["\u1056", "\u1059"], ["\u105E", "\u1060"], ["\u1062", "\u1064"], ["\u1067", "\u106D"], ["\u1071", "\u1074"], ["\u1082", "\u108D"], ["\u108F", "\u109D"], ["\u135D", "\u135F"], ["\u1712", "\u1714"], ["\u1732", "\u1734"], ["\u1752", "\u1753"], ["\u1772", "\u1773"], ["\u17B4", "\u17D3"], "\u17DD", ["\u17E0", "\u17E9"], ["\u180B", "\u180D"], ["\u1810", "\u1819"], "\u18A9", ["\u1920", "\u192B"], ["\u1930", "\u193B"], ["\u1946", "\u194F"], ["\u19D0", "\u19D9"], ["\u1A17", "\u1A1B"], ["\u1A55", "\u1A5E"], ["\u1A60", "\u1A7C"], ["\u1A7F", "\u1A89"], ["\u1A90", "\u1A99"], ["\u1AB0", "\u1ABD"], ["\u1B00", "\u1B04"], ["\u1B34", "\u1B44"], ["\u1B50", "\u1B59"], ["\u1B6B", "\u1B73"], ["\u1B80", "\u1B82"], ["\u1BA1", "\u1BAD"], ["\u1BB0", "\u1BB9"], ["\u1BE6", "\u1BF3"], ["\u1C24", "\u1C37"], ["\u1C40", "\u1C49"], ["\u1C50", "\u1C59"], ["\u1CD0", "\u1CD2"], ["\u1CD4", "\u1CE8"], "\u1CED", ["\u1CF2", "\u1CF4"], ["\u1CF8", "\u1CF9"], ["\u1DC0", "\u1DF5"], ["\u1DFC", "\u1DFF"], ["\u200C", "\u200D"], ["\u203F", "\u2040"], "\u2054", ["\u20D0", "\u20DC"], "\u20E1", ["\u20E5", "\u20F0"], ["\u2CEF", "\u2CF1"], "\u2D7F", ["\u2DE0", "\u2DFF"], ["\u302A", "\u302F"], ["\u3099", "\u309A"], ["\uA620", "\uA629"], "\uA66F", ["\uA674", "\uA67D"], ["\uA69E", "\uA69F"], ["\uA6F0", "\uA6F1"], "\uA802", "\uA806", "\uA80B", ["\uA823", "\uA827"], ["\uA880", "\uA881"], ["\uA8B4", "\uA8C4"], ["\uA8D0", "\uA8D9"], ["\uA8E0", "\uA8F1"], ["\uA900", "\uA909"], ["\uA926", "\uA92D"], ["\uA947", "\uA953"], ["\uA980", "\uA983"], ["\uA9B3", "\uA9C0"], ["\uA9D0", "\uA9D9"], "\uA9E5", ["\uA9F0", "\uA9F9"], ["\uAA29", "\uAA36"], "\uAA43", ["\uAA4C", "\uAA4D"], ["\uAA50", "\uAA59"], ["\uAA7B", "\uAA7D"], "\uAAB0", ["\uAAB2", "\uAAB4"], ["\uAAB7", "\uAAB8"], ["\uAABE", "\uAABF"], "\uAAC1", ["\uAAEB", "\uAAEF"], ["\uAAF5", "\uAAF6"], ["\uABE3", "\uABEA"], ["\uABEC", "\uABED"], ["\uABF0", "\uABF9"], "\uFB1E", ["\uFE00", "\uFE0F"], ["\uFE20", "\uFE2F"], ["\uFE33", "\uFE34"], ["\uFE4D", "\uFE4F"], ["\uFF10", "\uFF19"], "\uFF3F"], false, false);
      var peg$e36 = peg$classExpectation([["A", "Z"], ["a", "z"], "\xAA", "\xB5", "\xBA", ["\xC0", "\xD6"], ["\xD8", "\xF6"], ["\xF8", "\u02C1"], ["\u02C6", "\u02D1"], ["\u02E0", "\u02E4"], "\u02EC", "\u02EE", ["\u0370", "\u0374"], ["\u0376", "\u0377"], ["\u037A", "\u037D"], "\u037F", "\u0386", ["\u0388", "\u038A"], "\u038C", ["\u038E", "\u03A1"], ["\u03A3", "\u03F5"], ["\u03F7", "\u0481"], ["\u048A", "\u052F"], ["\u0531", "\u0556"], "\u0559", ["\u0561", "\u0587"], ["\u05D0", "\u05EA"], ["\u05F0", "\u05F2"], ["\u0620", "\u064A"], ["\u066E", "\u066F"], ["\u0671", "\u06D3"], "\u06D5", ["\u06E5", "\u06E6"], ["\u06EE", "\u06EF"], ["\u06FA", "\u06FC"], "\u06FF", "\u0710", ["\u0712", "\u072F"], ["\u074D", "\u07A5"], "\u07B1", ["\u07CA", "\u07EA"], ["\u07F4", "\u07F5"], "\u07FA", ["\u0800", "\u0815"], "\u081A", "\u0824", "\u0828", ["\u0840", "\u0858"], ["\u08A0", "\u08B4"], ["\u0904", "\u0939"], "\u093D", "\u0950", ["\u0958", "\u0961"], ["\u0971", "\u0980"], ["\u0985", "\u098C"], ["\u098F", "\u0990"], ["\u0993", "\u09A8"], ["\u09AA", "\u09B0"], "\u09B2", ["\u09B6", "\u09B9"], "\u09BD", "\u09CE", ["\u09DC", "\u09DD"], ["\u09DF", "\u09E1"], ["\u09F0", "\u09F1"], ["\u0A05", "\u0A0A"], ["\u0A0F", "\u0A10"], ["\u0A13", "\u0A28"], ["\u0A2A", "\u0A30"], ["\u0A32", "\u0A33"], ["\u0A35", "\u0A36"], ["\u0A38", "\u0A39"], ["\u0A59", "\u0A5C"], "\u0A5E", ["\u0A72", "\u0A74"], ["\u0A85", "\u0A8D"], ["\u0A8F", "\u0A91"], ["\u0A93", "\u0AA8"], ["\u0AAA", "\u0AB0"], ["\u0AB2", "\u0AB3"], ["\u0AB5", "\u0AB9"], "\u0ABD", "\u0AD0", ["\u0AE0", "\u0AE1"], "\u0AF9", ["\u0B05", "\u0B0C"], ["\u0B0F", "\u0B10"], ["\u0B13", "\u0B28"], ["\u0B2A", "\u0B30"], ["\u0B32", "\u0B33"], ["\u0B35", "\u0B39"], "\u0B3D", ["\u0B5C", "\u0B5D"], ["\u0B5F", "\u0B61"], "\u0B71", "\u0B83", ["\u0B85", "\u0B8A"], ["\u0B8E", "\u0B90"], ["\u0B92", "\u0B95"], ["\u0B99", "\u0B9A"], "\u0B9C", ["\u0B9E", "\u0B9F"], ["\u0BA3", "\u0BA4"], ["\u0BA8", "\u0BAA"], ["\u0BAE", "\u0BB9"], "\u0BD0", ["\u0C05", "\u0C0C"], ["\u0C0E", "\u0C10"], ["\u0C12", "\u0C28"], ["\u0C2A", "\u0C39"], "\u0C3D", ["\u0C58", "\u0C5A"], ["\u0C60", "\u0C61"], ["\u0C85", "\u0C8C"], ["\u0C8E", "\u0C90"], ["\u0C92", "\u0CA8"], ["\u0CAA", "\u0CB3"], ["\u0CB5", "\u0CB9"], "\u0CBD", "\u0CDE", ["\u0CE0", "\u0CE1"], ["\u0CF1", "\u0CF2"], ["\u0D05", "\u0D0C"], ["\u0D0E", "\u0D10"], ["\u0D12", "\u0D3A"], "\u0D3D", "\u0D4E", ["\u0D5F", "\u0D61"], ["\u0D7A", "\u0D7F"], ["\u0D85", "\u0D96"], ["\u0D9A", "\u0DB1"], ["\u0DB3", "\u0DBB"], "\u0DBD", ["\u0DC0", "\u0DC6"], ["\u0E01", "\u0E30"], ["\u0E32", "\u0E33"], ["\u0E40", "\u0E46"], ["\u0E81", "\u0E82"], "\u0E84", ["\u0E87", "\u0E88"], "\u0E8A", "\u0E8D", ["\u0E94", "\u0E97"], ["\u0E99", "\u0E9F"], ["\u0EA1", "\u0EA3"], "\u0EA5", "\u0EA7", ["\u0EAA", "\u0EAB"], ["\u0EAD", "\u0EB0"], ["\u0EB2", "\u0EB3"], "\u0EBD", ["\u0EC0", "\u0EC4"], "\u0EC6", ["\u0EDC", "\u0EDF"], "\u0F00", ["\u0F40", "\u0F47"], ["\u0F49", "\u0F6C"], ["\u0F88", "\u0F8C"], ["\u1000", "\u102A"], "\u103F", ["\u1050", "\u1055"], ["\u105A", "\u105D"], "\u1061", ["\u1065", "\u1066"], ["\u106E", "\u1070"], ["\u1075", "\u1081"], "\u108E", ["\u10A0", "\u10C5"], "\u10C7", "\u10CD", ["\u10D0", "\u10FA"], ["\u10FC", "\u1248"], ["\u124A", "\u124D"], ["\u1250", "\u1256"], "\u1258", ["\u125A", "\u125D"], ["\u1260", "\u1288"], ["\u128A", "\u128D"], ["\u1290", "\u12B0"], ["\u12B2", "\u12B5"], ["\u12B8", "\u12BE"], "\u12C0", ["\u12C2", "\u12C5"], ["\u12C8", "\u12D6"], ["\u12D8", "\u1310"], ["\u1312", "\u1315"], ["\u1318", "\u135A"], ["\u1380", "\u138F"], ["\u13A0", "\u13F5"], ["\u13F8", "\u13FD"], ["\u1401", "\u166C"], ["\u166F", "\u167F"], ["\u1681", "\u169A"], ["\u16A0", "\u16EA"], ["\u16EE", "\u16F8"], ["\u1700", "\u170C"], ["\u170E", "\u1711"], ["\u1720", "\u1731"], ["\u1740", "\u1751"], ["\u1760", "\u176C"], ["\u176E", "\u1770"], ["\u1780", "\u17B3"], "\u17D7", "\u17DC", ["\u1820", "\u1877"], ["\u1880", "\u18A8"], "\u18AA", ["\u18B0", "\u18F5"], ["\u1900", "\u191E"], ["\u1950", "\u196D"], ["\u1970", "\u1974"], ["\u1980", "\u19AB"], ["\u19B0", "\u19C9"], ["\u1A00", "\u1A16"], ["\u1A20", "\u1A54"], "\u1AA7", ["\u1B05", "\u1B33"], ["\u1B45", "\u1B4B"], ["\u1B83", "\u1BA0"], ["\u1BAE", "\u1BAF"], ["\u1BBA", "\u1BE5"], ["\u1C00", "\u1C23"], ["\u1C4D", "\u1C4F"], ["\u1C5A", "\u1C7D"], ["\u1CE9", "\u1CEC"], ["\u1CEE", "\u1CF1"], ["\u1CF5", "\u1CF6"], ["\u1D00", "\u1DBF"], ["\u1E00", "\u1F15"], ["\u1F18", "\u1F1D"], ["\u1F20", "\u1F45"], ["\u1F48", "\u1F4D"], ["\u1F50", "\u1F57"], "\u1F59", "\u1F5B", "\u1F5D", ["\u1F5F", "\u1F7D"], ["\u1F80", "\u1FB4"], ["\u1FB6", "\u1FBC"], "\u1FBE", ["\u1FC2", "\u1FC4"], ["\u1FC6", "\u1FCC"], ["\u1FD0", "\u1FD3"], ["\u1FD6", "\u1FDB"], ["\u1FE0", "\u1FEC"], ["\u1FF2", "\u1FF4"], ["\u1FF6", "\u1FFC"], "\u2071", "\u207F", ["\u2090", "\u209C"], "\u2102", "\u2107", ["\u210A", "\u2113"], "\u2115", ["\u2119", "\u211D"], "\u2124", "\u2126", "\u2128", ["\u212A", "\u212D"], ["\u212F", "\u2139"], ["\u213C", "\u213F"], ["\u2145", "\u2149"], "\u214E", ["\u2160", "\u2188"], ["\u2C00", "\u2C2E"], ["\u2C30", "\u2C5E"], ["\u2C60", "\u2CE4"], ["\u2CEB", "\u2CEE"], ["\u2CF2", "\u2CF3"], ["\u2D00", "\u2D25"], "\u2D27", "\u2D2D", ["\u2D30", "\u2D67"], "\u2D6F", ["\u2D80", "\u2D96"], ["\u2DA0", "\u2DA6"], ["\u2DA8", "\u2DAE"], ["\u2DB0", "\u2DB6"], ["\u2DB8", "\u2DBE"], ["\u2DC0", "\u2DC6"], ["\u2DC8", "\u2DCE"], ["\u2DD0", "\u2DD6"], ["\u2DD8", "\u2DDE"], "\u2E2F", ["\u3005", "\u3007"], ["\u3021", "\u3029"], ["\u3031", "\u3035"], ["\u3038", "\u303C"], ["\u3041", "\u3096"], ["\u309D", "\u309F"], ["\u30A1", "\u30FA"], ["\u30FC", "\u30FF"], ["\u3105", "\u312D"], ["\u3131", "\u318E"], ["\u31A0", "\u31BA"], ["\u31F0", "\u31FF"], ["\u3400", "\u4DB5"], ["\u4E00", "\u9FD5"], ["\uA000", "\uA48C"], ["\uA4D0", "\uA4FD"], ["\uA500", "\uA60C"], ["\uA610", "\uA61F"], ["\uA62A", "\uA62B"], ["\uA640", "\uA66E"], ["\uA67F", "\uA69D"], ["\uA6A0", "\uA6EF"], ["\uA717", "\uA71F"], ["\uA722", "\uA788"], ["\uA78B", "\uA7AD"], ["\uA7B0", "\uA7B7"], ["\uA7F7", "\uA801"], ["\uA803", "\uA805"], ["\uA807", "\uA80A"], ["\uA80C", "\uA822"], ["\uA840", "\uA873"], ["\uA882", "\uA8B3"], ["\uA8F2", "\uA8F7"], "\uA8FB", "\uA8FD", ["\uA90A", "\uA925"], ["\uA930", "\uA946"], ["\uA960", "\uA97C"], ["\uA984", "\uA9B2"], "\uA9CF", ["\uA9E0", "\uA9E4"], ["\uA9E6", "\uA9EF"], ["\uA9FA", "\uA9FE"], ["\uAA00", "\uAA28"], ["\uAA40", "\uAA42"], ["\uAA44", "\uAA4B"], ["\uAA60", "\uAA76"], "\uAA7A", ["\uAA7E", "\uAAAF"], "\uAAB1", ["\uAAB5", "\uAAB6"], ["\uAAB9", "\uAABD"], "\uAAC0", "\uAAC2", ["\uAADB", "\uAADD"], ["\uAAE0", "\uAAEA"], ["\uAAF2", "\uAAF4"], ["\uAB01", "\uAB06"], ["\uAB09", "\uAB0E"], ["\uAB11", "\uAB16"], ["\uAB20", "\uAB26"], ["\uAB28", "\uAB2E"], ["\uAB30", "\uAB5A"], ["\uAB5C", "\uAB65"], ["\uAB70", "\uABE2"], ["\uAC00", "\uD7A3"], ["\uD7B0", "\uD7C6"], ["\uD7CB", "\uD7FB"], ["\uF900", "\uFA6D"], ["\uFA70", "\uFAD9"], ["\uFB00", "\uFB06"], ["\uFB13", "\uFB17"], "\uFB1D", ["\uFB1F", "\uFB28"], ["\uFB2A", "\uFB36"], ["\uFB38", "\uFB3C"], "\uFB3E", ["\uFB40", "\uFB41"], ["\uFB43", "\uFB44"], ["\uFB46", "\uFBB1"], ["\uFBD3", "\uFD3D"], ["\uFD50", "\uFD8F"], ["\uFD92", "\uFDC7"], ["\uFDF0", "\uFDFB"], ["\uFE70", "\uFE74"], ["\uFE76", "\uFEFC"], ["\uFF21", "\uFF3A"], ["\uFF41", "\uFF5A"], ["\uFF66", "\uFFBE"], ["\uFFC2", "\uFFC7"], ["\uFFCA", "\uFFCF"], ["\uFFD2", "\uFFD7"], ["\uFFDA", "\uFFDC"]], false, false);
      var peg$e37 = peg$classExpectation([["\u0300", "\u036F"], ["\u0483", "\u0487"], ["\u0591", "\u05BD"], "\u05BF", ["\u05C1", "\u05C2"], ["\u05C4", "\u05C5"], "\u05C7", ["\u0610", "\u061A"], ["\u064B", "\u065F"], "\u0670", ["\u06D6", "\u06DC"], ["\u06DF", "\u06E4"], ["\u06E7", "\u06E8"], ["\u06EA", "\u06ED"], "\u0711", ["\u0730", "\u074A"], ["\u07A6", "\u07B0"], ["\u07EB", "\u07F3"], ["\u0816", "\u0819"], ["\u081B", "\u0823"], ["\u0825", "\u0827"], ["\u0829", "\u082D"], ["\u0859", "\u085B"], ["\u08E3", "\u0903"], ["\u093A", "\u093C"], ["\u093E", "\u094F"], ["\u0951", "\u0957"], ["\u0962", "\u0963"], ["\u0981", "\u0983"], "\u09BC", ["\u09BE", "\u09C4"], ["\u09C7", "\u09C8"], ["\u09CB", "\u09CD"], "\u09D7", ["\u09E2", "\u09E3"], ["\u0A01", "\u0A03"], "\u0A3C", ["\u0A3E", "\u0A42"], ["\u0A47", "\u0A48"], ["\u0A4B", "\u0A4D"], "\u0A51", ["\u0A70", "\u0A71"], "\u0A75", ["\u0A81", "\u0A83"], "\u0ABC", ["\u0ABE", "\u0AC5"], ["\u0AC7", "\u0AC9"], ["\u0ACB", "\u0ACD"], ["\u0AE2", "\u0AE3"], ["\u0B01", "\u0B03"], "\u0B3C", ["\u0B3E", "\u0B44"], ["\u0B47", "\u0B48"], ["\u0B4B", "\u0B4D"], ["\u0B56", "\u0B57"], ["\u0B62", "\u0B63"], "\u0B82", ["\u0BBE", "\u0BC2"], ["\u0BC6", "\u0BC8"], ["\u0BCA", "\u0BCD"], "\u0BD7", ["\u0C00", "\u0C03"], ["\u0C3E", "\u0C44"], ["\u0C46", "\u0C48"], ["\u0C4A", "\u0C4D"], ["\u0C55", "\u0C56"], ["\u0C62", "\u0C63"], ["\u0C81", "\u0C83"], "\u0CBC", ["\u0CBE", "\u0CC4"], ["\u0CC6", "\u0CC8"], ["\u0CCA", "\u0CCD"], ["\u0CD5", "\u0CD6"], ["\u0CE2", "\u0CE3"], ["\u0D01", "\u0D03"], ["\u0D3E", "\u0D44"], ["\u0D46", "\u0D48"], ["\u0D4A", "\u0D4D"], "\u0D57", ["\u0D62", "\u0D63"], ["\u0D82", "\u0D83"], "\u0DCA", ["\u0DCF", "\u0DD4"], "\u0DD6", ["\u0DD8", "\u0DDF"], ["\u0DF2", "\u0DF3"], "\u0E31", ["\u0E34", "\u0E3A"], ["\u0E47", "\u0E4E"], "\u0EB1", ["\u0EB4", "\u0EB9"], ["\u0EBB", "\u0EBC"], ["\u0EC8", "\u0ECD"], ["\u0F18", "\u0F19"], "\u0F35", "\u0F37", "\u0F39", ["\u0F3E", "\u0F3F"], ["\u0F71", "\u0F84"], ["\u0F86", "\u0F87"], ["\u0F8D", "\u0F97"], ["\u0F99", "\u0FBC"], "\u0FC6", ["\u102B", "\u103E"], ["\u1056", "\u1059"], ["\u105E", "\u1060"], ["\u1062", "\u1064"], ["\u1067", "\u106D"], ["\u1071", "\u1074"], ["\u1082", "\u108D"], "\u108F", ["\u109A", "\u109D"], ["\u135D", "\u135F"], ["\u1712", "\u1714"], ["\u1732", "\u1734"], ["\u1752", "\u1753"], ["\u1772", "\u1773"], ["\u17B4", "\u17D3"], "\u17DD", ["\u180B", "\u180D"], "\u18A9", ["\u1920", "\u192B"], ["\u1930", "\u193B"], ["\u1A17", "\u1A1B"], ["\u1A55", "\u1A5E"], ["\u1A60", "\u1A7C"], "\u1A7F", ["\u1AB0", "\u1ABD"], ["\u1B00", "\u1B04"], ["\u1B34", "\u1B44"], ["\u1B6B", "\u1B73"], ["\u1B80", "\u1B82"], ["\u1BA1", "\u1BAD"], ["\u1BE6", "\u1BF3"], ["\u1C24", "\u1C37"], ["\u1CD0", "\u1CD2"], ["\u1CD4", "\u1CE8"], "\u1CED", ["\u1CF2", "\u1CF4"], ["\u1CF8", "\u1CF9"], ["\u1DC0", "\u1DF5"], ["\u1DFC", "\u1DFF"], ["\u20D0", "\u20DC"], "\u20E1", ["\u20E5", "\u20F0"], ["\u2CEF", "\u2CF1"], "\u2D7F", ["\u2DE0", "\u2DFF"], ["\u302A", "\u302F"], ["\u3099", "\u309A"], "\uA66F", ["\uA674", "\uA67D"], ["\uA69E", "\uA69F"], ["\uA6F0", "\uA6F1"], "\uA802", "\uA806", "\uA80B", ["\uA823", "\uA827"], ["\uA880", "\uA881"], ["\uA8B4", "\uA8C4"], ["\uA8E0", "\uA8F1"], ["\uA926", "\uA92D"], ["\uA947", "\uA953"], ["\uA980", "\uA983"], ["\uA9B3", "\uA9C0"], "\uA9E5", ["\uAA29", "\uAA36"], "\uAA43", ["\uAA4C", "\uAA4D"], ["\uAA7B", "\uAA7D"], "\uAAB0", ["\uAAB2", "\uAAB4"], ["\uAAB7", "\uAAB8"], ["\uAABE", "\uAABF"], "\uAAC1", ["\uAAEB", "\uAAEF"], ["\uAAF5", "\uAAF6"], ["\uABE3", "\uABEA"], ["\uABEC", "\uABED"], "\uFB1E", ["\uFE00", "\uFE0F"], ["\uFE20", "\uFE2F"]], false, false);
      var peg$e38 = peg$otherExpectation("literal");
      var peg$e39 = peg$literalExpectation("i", false);
      var peg$e40 = peg$otherExpectation("string");
      var peg$e41 = peg$literalExpectation('"', false);
      var peg$e42 = peg$literalExpectation("'", false);
      var peg$e43 = peg$classExpectation(["\n", "\r", '"', "\\", ["\u2028", "\u2029"]], false, false);
      var peg$e44 = peg$classExpectation(["\n", "\r", "'", "\\", ["\u2028", "\u2029"]], false, false);
      var peg$e45 = peg$otherExpectation("character class");
      var peg$e46 = peg$literalExpectation("[", false);
      var peg$e47 = peg$literalExpectation("^", false);
      var peg$e48 = peg$literalExpectation("]", false);
      var peg$e49 = peg$literalExpectation("-", false);
      var peg$e50 = peg$classExpectation(["\n", "\r", ["\\", "]"], ["\u2028", "\u2029"]], false, false);
      var peg$e51 = peg$literalExpectation("0", false);
      var peg$e52 = peg$classExpectation(['"', "'", "\\"], false, false);
      var peg$e53 = peg$literalExpectation("b", false);
      var peg$e54 = peg$literalExpectation("f", false);
      var peg$e55 = peg$literalExpectation("n", false);
      var peg$e56 = peg$literalExpectation("r", false);
      var peg$e57 = peg$literalExpectation("t", false);
      var peg$e58 = peg$literalExpectation("v", false);
      var peg$e59 = peg$classExpectation([["0", "9"], "u", "x"], false, false);
      var peg$e60 = peg$literalExpectation("x", false);
      var peg$e61 = peg$literalExpectation("u", false);
      var peg$e62 = peg$classExpectation([["0", "9"]], false, false);
      var peg$e63 = peg$classExpectation([["0", "9"], ["a", "f"]], false, true);
      var peg$e64 = peg$otherExpectation("code block");
      var peg$e65 = peg$classExpectation(["{", "}"], false, false);
      var peg$e66 = peg$classExpectation([["a", "z"], "\xB5", ["\xDF", "\xF6"], ["\xF8", "\xFF"], "\u0101", "\u0103", "\u0105", "\u0107", "\u0109", "\u010B", "\u010D", "\u010F", "\u0111", "\u0113", "\u0115", "\u0117", "\u0119", "\u011B", "\u011D", "\u011F", "\u0121", "\u0123", "\u0125", "\u0127", "\u0129", "\u012B", "\u012D", "\u012F", "\u0131", "\u0133", "\u0135", ["\u0137", "\u0138"], "\u013A", "\u013C", "\u013E", "\u0140", "\u0142", "\u0144", "\u0146", ["\u0148", "\u0149"], "\u014B", "\u014D", "\u014F", "\u0151", "\u0153", "\u0155", "\u0157", "\u0159", "\u015B", "\u015D", "\u015F", "\u0161", "\u0163", "\u0165", "\u0167", "\u0169", "\u016B", "\u016D", "\u016F", "\u0171", "\u0173", "\u0175", "\u0177", "\u017A", "\u017C", ["\u017E", "\u0180"], "\u0183", "\u0185", "\u0188", ["\u018C", "\u018D"], "\u0192", "\u0195", ["\u0199", "\u019B"], "\u019E", "\u01A1", "\u01A3", "\u01A5", "\u01A8", ["\u01AA", "\u01AB"], "\u01AD", "\u01B0", "\u01B4", "\u01B6", ["\u01B9", "\u01BA"], ["\u01BD", "\u01BF"], "\u01C6", "\u01C9", "\u01CC", "\u01CE", "\u01D0", "\u01D2", "\u01D4", "\u01D6", "\u01D8", "\u01DA", ["\u01DC", "\u01DD"], "\u01DF", "\u01E1", "\u01E3", "\u01E5", "\u01E7", "\u01E9", "\u01EB", "\u01ED", ["\u01EF", "\u01F0"], "\u01F3", "\u01F5", "\u01F9", "\u01FB", "\u01FD", "\u01FF", "\u0201", "\u0203", "\u0205", "\u0207", "\u0209", "\u020B", "\u020D", "\u020F", "\u0211", "\u0213", "\u0215", "\u0217", "\u0219", "\u021B", "\u021D", "\u021F", "\u0221", "\u0223", "\u0225", "\u0227", "\u0229", "\u022B", "\u022D", "\u022F", "\u0231", ["\u0233", "\u0239"], "\u023C", ["\u023F", "\u0240"], "\u0242", "\u0247", "\u0249", "\u024B", "\u024D", ["\u024F", "\u0293"], ["\u0295", "\u02AF"], "\u0371", "\u0373", "\u0377", ["\u037B", "\u037D"], "\u0390", ["\u03AC", "\u03CE"], ["\u03D0", "\u03D1"], ["\u03D5", "\u03D7"], "\u03D9", "\u03DB", "\u03DD", "\u03DF", "\u03E1", "\u03E3", "\u03E5", "\u03E7", "\u03E9", "\u03EB", "\u03ED", ["\u03EF", "\u03F3"], "\u03F5", "\u03F8", ["\u03FB", "\u03FC"], ["\u0430", "\u045F"], "\u0461", "\u0463", "\u0465", "\u0467", "\u0469", "\u046B", "\u046D", "\u046F", "\u0471", "\u0473", "\u0475", "\u0477", "\u0479", "\u047B", "\u047D", "\u047F", "\u0481", "\u048B", "\u048D", "\u048F", "\u0491", "\u0493", "\u0495", "\u0497", "\u0499", "\u049B", "\u049D", "\u049F", "\u04A1", "\u04A3", "\u04A5", "\u04A7", "\u04A9", "\u04AB", "\u04AD", "\u04AF", "\u04B1", "\u04B3", "\u04B5", "\u04B7", "\u04B9", "\u04BB", "\u04BD", "\u04BF", "\u04C2", "\u04C4", "\u04C6", "\u04C8", "\u04CA", "\u04CC", ["\u04CE", "\u04CF"], "\u04D1", "\u04D3", "\u04D5", "\u04D7", "\u04D9", "\u04DB", "\u04DD", "\u04DF", "\u04E1", "\u04E3", "\u04E5", "\u04E7", "\u04E9", "\u04EB", "\u04ED", "\u04EF", "\u04F1", "\u04F3", "\u04F5", "\u04F7", "\u04F9", "\u04FB", "\u04FD", "\u04FF", "\u0501", "\u0503", "\u0505", "\u0507", "\u0509", "\u050B", "\u050D", "\u050F", "\u0511", "\u0513", "\u0515", "\u0517", "\u0519", "\u051B", "\u051D", "\u051F", "\u0521", "\u0523", "\u0525", "\u0527", "\u0529", "\u052B", "\u052D", "\u052F", ["\u0561", "\u0587"], ["\u13F8", "\u13FD"], ["\u1D00", "\u1D2B"], ["\u1D6B", "\u1D77"], ["\u1D79", "\u1D9A"], "\u1E01", "\u1E03", "\u1E05", "\u1E07", "\u1E09", "\u1E0B", "\u1E0D", "\u1E0F", "\u1E11", "\u1E13", "\u1E15", "\u1E17", "\u1E19", "\u1E1B", "\u1E1D", "\u1E1F", "\u1E21", "\u1E23", "\u1E25", "\u1E27", "\u1E29", "\u1E2B", "\u1E2D", "\u1E2F", "\u1E31", "\u1E33", "\u1E35", "\u1E37", "\u1E39", "\u1E3B", "\u1E3D", "\u1E3F", "\u1E41", "\u1E43", "\u1E45", "\u1E47", "\u1E49", "\u1E4B", "\u1E4D", "\u1E4F", "\u1E51", "\u1E53", "\u1E55", "\u1E57", "\u1E59", "\u1E5B", "\u1E5D", "\u1E5F", "\u1E61", "\u1E63", "\u1E65", "\u1E67", "\u1E69", "\u1E6B", "\u1E6D", "\u1E6F", "\u1E71", "\u1E73", "\u1E75", "\u1E77", "\u1E79", "\u1E7B", "\u1E7D", "\u1E7F", "\u1E81", "\u1E83", "\u1E85", "\u1E87", "\u1E89", "\u1E8B", "\u1E8D", "\u1E8F", "\u1E91", "\u1E93", ["\u1E95", "\u1E9D"], "\u1E9F", "\u1EA1", "\u1EA3", "\u1EA5", "\u1EA7", "\u1EA9", "\u1EAB", "\u1EAD", "\u1EAF", "\u1EB1", "\u1EB3", "\u1EB5", "\u1EB7", "\u1EB9", "\u1EBB", "\u1EBD", "\u1EBF", "\u1EC1", "\u1EC3", "\u1EC5", "\u1EC7", "\u1EC9", "\u1ECB", "\u1ECD", "\u1ECF", "\u1ED1", "\u1ED3", "\u1ED5", "\u1ED7", "\u1ED9", "\u1EDB", "\u1EDD", "\u1EDF", "\u1EE1", "\u1EE3", "\u1EE5", "\u1EE7", "\u1EE9", "\u1EEB", "\u1EED", "\u1EEF", "\u1EF1", "\u1EF3", "\u1EF5", "\u1EF7", "\u1EF9", "\u1EFB", "\u1EFD", ["\u1EFF", "\u1F07"], ["\u1F10", "\u1F15"], ["\u1F20", "\u1F27"], ["\u1F30", "\u1F37"], ["\u1F40", "\u1F45"], ["\u1F50", "\u1F57"], ["\u1F60", "\u1F67"], ["\u1F70", "\u1F7D"], ["\u1F80", "\u1F87"], ["\u1F90", "\u1F97"], ["\u1FA0", "\u1FA7"], ["\u1FB0", "\u1FB4"], ["\u1FB6", "\u1FB7"], "\u1FBE", ["\u1FC2", "\u1FC4"], ["\u1FC6", "\u1FC7"], ["\u1FD0", "\u1FD3"], ["\u1FD6", "\u1FD7"], ["\u1FE0", "\u1FE7"], ["\u1FF2", "\u1FF4"], ["\u1FF6", "\u1FF7"], "\u210A", ["\u210E", "\u210F"], "\u2113", "\u212F", "\u2134", "\u2139", ["\u213C", "\u213D"], ["\u2146", "\u2149"], "\u214E", "\u2184", ["\u2C30", "\u2C5E"], "\u2C61", ["\u2C65", "\u2C66"], "\u2C68", "\u2C6A", "\u2C6C", "\u2C71", ["\u2C73", "\u2C74"], ["\u2C76", "\u2C7B"], "\u2C81", "\u2C83", "\u2C85", "\u2C87", "\u2C89", "\u2C8B", "\u2C8D", "\u2C8F", "\u2C91", "\u2C93", "\u2C95", "\u2C97", "\u2C99", "\u2C9B", "\u2C9D", "\u2C9F", "\u2CA1", "\u2CA3", "\u2CA5", "\u2CA7", "\u2CA9", "\u2CAB", "\u2CAD", "\u2CAF", "\u2CB1", "\u2CB3", "\u2CB5", "\u2CB7", "\u2CB9", "\u2CBB", "\u2CBD", "\u2CBF", "\u2CC1", "\u2CC3", "\u2CC5", "\u2CC7", "\u2CC9", "\u2CCB", "\u2CCD", "\u2CCF", "\u2CD1", "\u2CD3", "\u2CD5", "\u2CD7", "\u2CD9", "\u2CDB", "\u2CDD", "\u2CDF", "\u2CE1", ["\u2CE3", "\u2CE4"], "\u2CEC", "\u2CEE", "\u2CF3", ["\u2D00", "\u2D25"], "\u2D27", "\u2D2D", "\uA641", "\uA643", "\uA645", "\uA647", "\uA649", "\uA64B", "\uA64D", "\uA64F", "\uA651", "\uA653", "\uA655", "\uA657", "\uA659", "\uA65B", "\uA65D", "\uA65F", "\uA661", "\uA663", "\uA665", "\uA667", "\uA669", "\uA66B", "\uA66D", "\uA681", "\uA683", "\uA685", "\uA687", "\uA689", "\uA68B", "\uA68D", "\uA68F", "\uA691", "\uA693", "\uA695", "\uA697", "\uA699", "\uA69B", "\uA723", "\uA725", "\uA727", "\uA729", "\uA72B", "\uA72D", ["\uA72F", "\uA731"], "\uA733", "\uA735", "\uA737", "\uA739", "\uA73B", "\uA73D", "\uA73F", "\uA741", "\uA743", "\uA745", "\uA747", "\uA749", "\uA74B", "\uA74D", "\uA74F", "\uA751", "\uA753", "\uA755", "\uA757", "\uA759", "\uA75B", "\uA75D", "\uA75F", "\uA761", "\uA763", "\uA765", "\uA767", "\uA769", "\uA76B", "\uA76D", "\uA76F", ["\uA771", "\uA778"], "\uA77A", "\uA77C", "\uA77F", "\uA781", "\uA783", "\uA785", "\uA787", "\uA78C", "\uA78E", "\uA791", ["\uA793", "\uA795"], "\uA797", "\uA799", "\uA79B", "\uA79D", "\uA79F", "\uA7A1", "\uA7A3", "\uA7A5", "\uA7A7", "\uA7A9", "\uA7B5", "\uA7B7", "\uA7FA", ["\uAB30", "\uAB5A"], ["\uAB60", "\uAB65"], ["\uAB70", "\uABBF"], ["\uFB00", "\uFB06"], ["\uFB13", "\uFB17"], ["\uFF41", "\uFF5A"]], false, false);
      var peg$e67 = peg$classExpectation([["\u02B0", "\u02C1"], ["\u02C6", "\u02D1"], ["\u02E0", "\u02E4"], "\u02EC", "\u02EE", "\u0374", "\u037A", "\u0559", "\u0640", ["\u06E5", "\u06E6"], ["\u07F4", "\u07F5"], "\u07FA", "\u081A", "\u0824", "\u0828", "\u0971", "\u0E46", "\u0EC6", "\u10FC", "\u17D7", "\u1843", "\u1AA7", ["\u1C78", "\u1C7D"], ["\u1D2C", "\u1D6A"], "\u1D78", ["\u1D9B", "\u1DBF"], "\u2071", "\u207F", ["\u2090", "\u209C"], ["\u2C7C", "\u2C7D"], "\u2D6F", "\u2E2F", "\u3005", ["\u3031", "\u3035"], "\u303B", ["\u309D", "\u309E"], ["\u30FC", "\u30FE"], "\uA015", ["\uA4F8", "\uA4FD"], "\uA60C", "\uA67F", ["\uA69C", "\uA69D"], ["\uA717", "\uA71F"], "\uA770", "\uA788", ["\uA7F8", "\uA7F9"], "\uA9CF", "\uA9E6", "\uAA70", "\uAADD", ["\uAAF3", "\uAAF4"], ["\uAB5C", "\uAB5F"], "\uFF70", ["\uFF9E", "\uFF9F"]], false, false);
      var peg$e68 = peg$classExpectation(["\xAA", "\xBA", "\u01BB", ["\u01C0", "\u01C3"], "\u0294", ["\u05D0", "\u05EA"], ["\u05F0", "\u05F2"], ["\u0620", "\u063F"], ["\u0641", "\u064A"], ["\u066E", "\u066F"], ["\u0671", "\u06D3"], "\u06D5", ["\u06EE", "\u06EF"], ["\u06FA", "\u06FC"], "\u06FF", "\u0710", ["\u0712", "\u072F"], ["\u074D", "\u07A5"], "\u07B1", ["\u07CA", "\u07EA"], ["\u0800", "\u0815"], ["\u0840", "\u0858"], ["\u08A0", "\u08B4"], ["\u0904", "\u0939"], "\u093D", "\u0950", ["\u0958", "\u0961"], ["\u0972", "\u0980"], ["\u0985", "\u098C"], ["\u098F", "\u0990"], ["\u0993", "\u09A8"], ["\u09AA", "\u09B0"], "\u09B2", ["\u09B6", "\u09B9"], "\u09BD", "\u09CE", ["\u09DC", "\u09DD"], ["\u09DF", "\u09E1"], ["\u09F0", "\u09F1"], ["\u0A05", "\u0A0A"], ["\u0A0F", "\u0A10"], ["\u0A13", "\u0A28"], ["\u0A2A", "\u0A30"], ["\u0A32", "\u0A33"], ["\u0A35", "\u0A36"], ["\u0A38", "\u0A39"], ["\u0A59", "\u0A5C"], "\u0A5E", ["\u0A72", "\u0A74"], ["\u0A85", "\u0A8D"], ["\u0A8F", "\u0A91"], ["\u0A93", "\u0AA8"], ["\u0AAA", "\u0AB0"], ["\u0AB2", "\u0AB3"], ["\u0AB5", "\u0AB9"], "\u0ABD", "\u0AD0", ["\u0AE0", "\u0AE1"], "\u0AF9", ["\u0B05", "\u0B0C"], ["\u0B0F", "\u0B10"], ["\u0B13", "\u0B28"], ["\u0B2A", "\u0B30"], ["\u0B32", "\u0B33"], ["\u0B35", "\u0B39"], "\u0B3D", ["\u0B5C", "\u0B5D"], ["\u0B5F", "\u0B61"], "\u0B71", "\u0B83", ["\u0B85", "\u0B8A"], ["\u0B8E", "\u0B90"], ["\u0B92", "\u0B95"], ["\u0B99", "\u0B9A"], "\u0B9C", ["\u0B9E", "\u0B9F"], ["\u0BA3", "\u0BA4"], ["\u0BA8", "\u0BAA"], ["\u0BAE", "\u0BB9"], "\u0BD0", ["\u0C05", "\u0C0C"], ["\u0C0E", "\u0C10"], ["\u0C12", "\u0C28"], ["\u0C2A", "\u0C39"], "\u0C3D", ["\u0C58", "\u0C5A"], ["\u0C60", "\u0C61"], ["\u0C85", "\u0C8C"], ["\u0C8E", "\u0C90"], ["\u0C92", "\u0CA8"], ["\u0CAA", "\u0CB3"], ["\u0CB5", "\u0CB9"], "\u0CBD", "\u0CDE", ["\u0CE0", "\u0CE1"], ["\u0CF1", "\u0CF2"], ["\u0D05", "\u0D0C"], ["\u0D0E", "\u0D10"], ["\u0D12", "\u0D3A"], "\u0D3D", "\u0D4E", ["\u0D5F", "\u0D61"], ["\u0D7A", "\u0D7F"], ["\u0D85", "\u0D96"], ["\u0D9A", "\u0DB1"], ["\u0DB3", "\u0DBB"], "\u0DBD", ["\u0DC0", "\u0DC6"], ["\u0E01", "\u0E30"], ["\u0E32", "\u0E33"], ["\u0E40", "\u0E45"], ["\u0E81", "\u0E82"], "\u0E84", ["\u0E87", "\u0E88"], "\u0E8A", "\u0E8D", ["\u0E94", "\u0E97"], ["\u0E99", "\u0E9F"], ["\u0EA1", "\u0EA3"], "\u0EA5", "\u0EA7", ["\u0EAA", "\u0EAB"], ["\u0EAD", "\u0EB0"], ["\u0EB2", "\u0EB3"], "\u0EBD", ["\u0EC0", "\u0EC4"], ["\u0EDC", "\u0EDF"], "\u0F00", ["\u0F40", "\u0F47"], ["\u0F49", "\u0F6C"], ["\u0F88", "\u0F8C"], ["\u1000", "\u102A"], "\u103F", ["\u1050", "\u1055"], ["\u105A", "\u105D"], "\u1061", ["\u1065", "\u1066"], ["\u106E", "\u1070"], ["\u1075", "\u1081"], "\u108E", ["\u10D0", "\u10FA"], ["\u10FD", "\u1248"], ["\u124A", "\u124D"], ["\u1250", "\u1256"], "\u1258", ["\u125A", "\u125D"], ["\u1260", "\u1288"], ["\u128A", "\u128D"], ["\u1290", "\u12B0"], ["\u12B2", "\u12B5"], ["\u12B8", "\u12BE"], "\u12C0", ["\u12C2", "\u12C5"], ["\u12C8", "\u12D6"], ["\u12D8", "\u1310"], ["\u1312", "\u1315"], ["\u1318", "\u135A"], ["\u1380", "\u138F"], ["\u1401", "\u166C"], ["\u166F", "\u167F"], ["\u1681", "\u169A"], ["\u16A0", "\u16EA"], ["\u16F1", "\u16F8"], ["\u1700", "\u170C"], ["\u170E", "\u1711"], ["\u1720", "\u1731"], ["\u1740", "\u1751"], ["\u1760", "\u176C"], ["\u176E", "\u1770"], ["\u1780", "\u17B3"], "\u17DC", ["\u1820", "\u1842"], ["\u1844", "\u1877"], ["\u1880", "\u18A8"], "\u18AA", ["\u18B0", "\u18F5"], ["\u1900", "\u191E"], ["\u1950", "\u196D"], ["\u1970", "\u1974"], ["\u1980", "\u19AB"], ["\u19B0", "\u19C9"], ["\u1A00", "\u1A16"], ["\u1A20", "\u1A54"], ["\u1B05", "\u1B33"], ["\u1B45", "\u1B4B"], ["\u1B83", "\u1BA0"], ["\u1BAE", "\u1BAF"], ["\u1BBA", "\u1BE5"], ["\u1C00", "\u1C23"], ["\u1C4D", "\u1C4F"], ["\u1C5A", "\u1C77"], ["\u1CE9", "\u1CEC"], ["\u1CEE", "\u1CF1"], ["\u1CF5", "\u1CF6"], ["\u2135", "\u2138"], ["\u2D30", "\u2D67"], ["\u2D80", "\u2D96"], ["\u2DA0", "\u2DA6"], ["\u2DA8", "\u2DAE"], ["\u2DB0", "\u2DB6"], ["\u2DB8", "\u2DBE"], ["\u2DC0", "\u2DC6"], ["\u2DC8", "\u2DCE"], ["\u2DD0", "\u2DD6"], ["\u2DD8", "\u2DDE"], "\u3006", "\u303C", ["\u3041", "\u3096"], "\u309F", ["\u30A1", "\u30FA"], "\u30FF", ["\u3105", "\u312D"], ["\u3131", "\u318E"], ["\u31A0", "\u31BA"], ["\u31F0", "\u31FF"], ["\u3400", "\u4DB5"], ["\u4E00", "\u9FD5"], ["\uA000", "\uA014"], ["\uA016", "\uA48C"], ["\uA4D0", "\uA4F7"], ["\uA500", "\uA60B"], ["\uA610", "\uA61F"], ["\uA62A", "\uA62B"], "\uA66E", ["\uA6A0", "\uA6E5"], "\uA78F", "\uA7F7", ["\uA7FB", "\uA801"], ["\uA803", "\uA805"], ["\uA807", "\uA80A"], ["\uA80C", "\uA822"], ["\uA840", "\uA873"], ["\uA882", "\uA8B3"], ["\uA8F2", "\uA8F7"], "\uA8FB", "\uA8FD", ["\uA90A", "\uA925"], ["\uA930", "\uA946"], ["\uA960", "\uA97C"], ["\uA984", "\uA9B2"], ["\uA9E0", "\uA9E4"], ["\uA9E7", "\uA9EF"], ["\uA9FA", "\uA9FE"], ["\uAA00", "\uAA28"], ["\uAA40", "\uAA42"], ["\uAA44", "\uAA4B"], ["\uAA60", "\uAA6F"], ["\uAA71", "\uAA76"], "\uAA7A", ["\uAA7E", "\uAAAF"], "\uAAB1", ["\uAAB5", "\uAAB6"], ["\uAAB9", "\uAABD"], "\uAAC0", "\uAAC2", ["\uAADB", "\uAADC"], ["\uAAE0", "\uAAEA"], "\uAAF2", ["\uAB01", "\uAB06"], ["\uAB09", "\uAB0E"], ["\uAB11", "\uAB16"], ["\uAB20", "\uAB26"], ["\uAB28", "\uAB2E"], ["\uABC0", "\uABE2"], ["\uAC00", "\uD7A3"], ["\uD7B0", "\uD7C6"], ["\uD7CB", "\uD7FB"], ["\uF900", "\uFA6D"], ["\uFA70", "\uFAD9"], "\uFB1D", ["\uFB1F", "\uFB28"], ["\uFB2A", "\uFB36"], ["\uFB38", "\uFB3C"], "\uFB3E", ["\uFB40", "\uFB41"], ["\uFB43", "\uFB44"], ["\uFB46", "\uFBB1"], ["\uFBD3", "\uFD3D"], ["\uFD50", "\uFD8F"], ["\uFD92", "\uFDC7"], ["\uFDF0", "\uFDFB"], ["\uFE70", "\uFE74"], ["\uFE76", "\uFEFC"], ["\uFF66", "\uFF6F"], ["\uFF71", "\uFF9D"], ["\uFFA0", "\uFFBE"], ["\uFFC2", "\uFFC7"], ["\uFFCA", "\uFFCF"], ["\uFFD2", "\uFFD7"], ["\uFFDA", "\uFFDC"]], false, false);
      var peg$e69 = peg$classExpectation(["\u01C5", "\u01C8", "\u01CB", "\u01F2", ["\u1F88", "\u1F8F"], ["\u1F98", "\u1F9F"], ["\u1FA8", "\u1FAF"], "\u1FBC", "\u1FCC", "\u1FFC"], false, false);
      var peg$e70 = peg$classExpectation([["A", "Z"], ["\xC0", "\xD6"], ["\xD8", "\xDE"], "\u0100", "\u0102", "\u0104", "\u0106", "\u0108", "\u010A", "\u010C", "\u010E", "\u0110", "\u0112", "\u0114", "\u0116", "\u0118", "\u011A", "\u011C", "\u011E", "\u0120", "\u0122", "\u0124", "\u0126", "\u0128", "\u012A", "\u012C", "\u012E", "\u0130", "\u0132", "\u0134", "\u0136", "\u0139", "\u013B", "\u013D", "\u013F", "\u0141", "\u0143", "\u0145", "\u0147", "\u014A", "\u014C", "\u014E", "\u0150", "\u0152", "\u0154", "\u0156", "\u0158", "\u015A", "\u015C", "\u015E", "\u0160", "\u0162", "\u0164", "\u0166", "\u0168", "\u016A", "\u016C", "\u016E", "\u0170", "\u0172", "\u0174", "\u0176", ["\u0178", "\u0179"], "\u017B", "\u017D", ["\u0181", "\u0182"], "\u0184", ["\u0186", "\u0187"], ["\u0189", "\u018B"], ["\u018E", "\u0191"], ["\u0193", "\u0194"], ["\u0196", "\u0198"], ["\u019C", "\u019D"], ["\u019F", "\u01A0"], "\u01A2", "\u01A4", ["\u01A6", "\u01A7"], "\u01A9", "\u01AC", ["\u01AE", "\u01AF"], ["\u01B1", "\u01B3"], "\u01B5", ["\u01B7", "\u01B8"], "\u01BC", "\u01C4", "\u01C7", "\u01CA", "\u01CD", "\u01CF", "\u01D1", "\u01D3", "\u01D5", "\u01D7", "\u01D9", "\u01DB", "\u01DE", "\u01E0", "\u01E2", "\u01E4", "\u01E6", "\u01E8", "\u01EA", "\u01EC", "\u01EE", "\u01F1", "\u01F4", ["\u01F6", "\u01F8"], "\u01FA", "\u01FC", "\u01FE", "\u0200", "\u0202", "\u0204", "\u0206", "\u0208", "\u020A", "\u020C", "\u020E", "\u0210", "\u0212", "\u0214", "\u0216", "\u0218", "\u021A", "\u021C", "\u021E", "\u0220", "\u0222", "\u0224", "\u0226", "\u0228", "\u022A", "\u022C", "\u022E", "\u0230", "\u0232", ["\u023A", "\u023B"], ["\u023D", "\u023E"], "\u0241", ["\u0243", "\u0246"], "\u0248", "\u024A", "\u024C", "\u024E", "\u0370", "\u0372", "\u0376", "\u037F", "\u0386", ["\u0388", "\u038A"], "\u038C", ["\u038E", "\u038F"], ["\u0391", "\u03A1"], ["\u03A3", "\u03AB"], "\u03CF", ["\u03D2", "\u03D4"], "\u03D8", "\u03DA", "\u03DC", "\u03DE", "\u03E0", "\u03E2", "\u03E4", "\u03E6", "\u03E8", "\u03EA", "\u03EC", "\u03EE", "\u03F4", "\u03F7", ["\u03F9", "\u03FA"], ["\u03FD", "\u042F"], "\u0460", "\u0462", "\u0464", "\u0466", "\u0468", "\u046A", "\u046C", "\u046E", "\u0470", "\u0472", "\u0474", "\u0476", "\u0478", "\u047A", "\u047C", "\u047E", "\u0480", "\u048A", "\u048C", "\u048E", "\u0490", "\u0492", "\u0494", "\u0496", "\u0498", "\u049A", "\u049C", "\u049E", "\u04A0", "\u04A2", "\u04A4", "\u04A6", "\u04A8", "\u04AA", "\u04AC", "\u04AE", "\u04B0", "\u04B2", "\u04B4", "\u04B6", "\u04B8", "\u04BA", "\u04BC", "\u04BE", ["\u04C0", "\u04C1"], "\u04C3", "\u04C5", "\u04C7", "\u04C9", "\u04CB", "\u04CD", "\u04D0", "\u04D2", "\u04D4", "\u04D6", "\u04D8", "\u04DA", "\u04DC", "\u04DE", "\u04E0", "\u04E2", "\u04E4", "\u04E6", "\u04E8", "\u04EA", "\u04EC", "\u04EE", "\u04F0", "\u04F2", "\u04F4", "\u04F6", "\u04F8", "\u04FA", "\u04FC", "\u04FE", "\u0500", "\u0502", "\u0504", "\u0506", "\u0508", "\u050A", "\u050C", "\u050E", "\u0510", "\u0512", "\u0514", "\u0516", "\u0518", "\u051A", "\u051C", "\u051E", "\u0520", "\u0522", "\u0524", "\u0526", "\u0528", "\u052A", "\u052C", "\u052E", ["\u0531", "\u0556"], ["\u10A0", "\u10C5"], "\u10C7", "\u10CD", ["\u13A0", "\u13F5"], "\u1E00", "\u1E02", "\u1E04", "\u1E06", "\u1E08", "\u1E0A", "\u1E0C", "\u1E0E", "\u1E10", "\u1E12", "\u1E14", "\u1E16", "\u1E18", "\u1E1A", "\u1E1C", "\u1E1E", "\u1E20", "\u1E22", "\u1E24", "\u1E26", "\u1E28", "\u1E2A", "\u1E2C", "\u1E2E", "\u1E30", "\u1E32", "\u1E34", "\u1E36", "\u1E38", "\u1E3A", "\u1E3C", "\u1E3E", "\u1E40", "\u1E42", "\u1E44", "\u1E46", "\u1E48", "\u1E4A", "\u1E4C", "\u1E4E", "\u1E50", "\u1E52", "\u1E54", "\u1E56", "\u1E58", "\u1E5A", "\u1E5C", "\u1E5E", "\u1E60", "\u1E62", "\u1E64", "\u1E66", "\u1E68", "\u1E6A", "\u1E6C", "\u1E6E", "\u1E70", "\u1E72", "\u1E74", "\u1E76", "\u1E78", "\u1E7A", "\u1E7C", "\u1E7E", "\u1E80", "\u1E82", "\u1E84", "\u1E86", "\u1E88", "\u1E8A", "\u1E8C", "\u1E8E", "\u1E90", "\u1E92", "\u1E94", "\u1E9E", "\u1EA0", "\u1EA2", "\u1EA4", "\u1EA6", "\u1EA8", "\u1EAA", "\u1EAC", "\u1EAE", "\u1EB0", "\u1EB2", "\u1EB4", "\u1EB6", "\u1EB8", "\u1EBA", "\u1EBC", "\u1EBE", "\u1EC0", "\u1EC2", "\u1EC4", "\u1EC6", "\u1EC8", "\u1ECA", "\u1ECC", "\u1ECE", "\u1ED0", "\u1ED2", "\u1ED4", "\u1ED6", "\u1ED8", "\u1EDA", "\u1EDC", "\u1EDE", "\u1EE0", "\u1EE2", "\u1EE4", "\u1EE6", "\u1EE8", "\u1EEA", "\u1EEC", "\u1EEE", "\u1EF0", "\u1EF2", "\u1EF4", "\u1EF6", "\u1EF8", "\u1EFA", "\u1EFC", "\u1EFE", ["\u1F08", "\u1F0F"], ["\u1F18", "\u1F1D"], ["\u1F28", "\u1F2F"], ["\u1F38", "\u1F3F"], ["\u1F48", "\u1F4D"], "\u1F59", "\u1F5B", "\u1F5D", "\u1F5F", ["\u1F68", "\u1F6F"], ["\u1FB8", "\u1FBB"], ["\u1FC8", "\u1FCB"], ["\u1FD8", "\u1FDB"], ["\u1FE8", "\u1FEC"], ["\u1FF8", "\u1FFB"], "\u2102", "\u2107", ["\u210B", "\u210D"], ["\u2110", "\u2112"], "\u2115", ["\u2119", "\u211D"], "\u2124", "\u2126", "\u2128", ["\u212A", "\u212D"], ["\u2130", "\u2133"], ["\u213E", "\u213F"], "\u2145", "\u2183", ["\u2C00", "\u2C2E"], "\u2C60", ["\u2C62", "\u2C64"], "\u2C67", "\u2C69", "\u2C6B", ["\u2C6D", "\u2C70"], "\u2C72", "\u2C75", ["\u2C7E", "\u2C80"], "\u2C82", "\u2C84", "\u2C86", "\u2C88", "\u2C8A", "\u2C8C", "\u2C8E", "\u2C90", "\u2C92", "\u2C94", "\u2C96", "\u2C98", "\u2C9A", "\u2C9C", "\u2C9E", "\u2CA0", "\u2CA2", "\u2CA4", "\u2CA6", "\u2CA8", "\u2CAA", "\u2CAC", "\u2CAE", "\u2CB0", "\u2CB2", "\u2CB4", "\u2CB6", "\u2CB8", "\u2CBA", "\u2CBC", "\u2CBE", "\u2CC0", "\u2CC2", "\u2CC4", "\u2CC6", "\u2CC8", "\u2CCA", "\u2CCC", "\u2CCE", "\u2CD0", "\u2CD2", "\u2CD4", "\u2CD6", "\u2CD8", "\u2CDA", "\u2CDC", "\u2CDE", "\u2CE0", "\u2CE2", "\u2CEB", "\u2CED", "\u2CF2", "\uA640", "\uA642", "\uA644", "\uA646", "\uA648", "\uA64A", "\uA64C", "\uA64E", "\uA650", "\uA652", "\uA654", "\uA656", "\uA658", "\uA65A", "\uA65C", "\uA65E", "\uA660", "\uA662", "\uA664", "\uA666", "\uA668", "\uA66A", "\uA66C", "\uA680", "\uA682", "\uA684", "\uA686", "\uA688", "\uA68A", "\uA68C", "\uA68E", "\uA690", "\uA692", "\uA694", "\uA696", "\uA698", "\uA69A", "\uA722", "\uA724", "\uA726", "\uA728", "\uA72A", "\uA72C", "\uA72E", "\uA732", "\uA734", "\uA736", "\uA738", "\uA73A", "\uA73C", "\uA73E", "\uA740", "\uA742", "\uA744", "\uA746", "\uA748", "\uA74A", "\uA74C", "\uA74E", "\uA750", "\uA752", "\uA754", "\uA756", "\uA758", "\uA75A", "\uA75C", "\uA75E", "\uA760", "\uA762", "\uA764", "\uA766", "\uA768", "\uA76A", "\uA76C", "\uA76E", "\uA779", "\uA77B", ["\uA77D", "\uA77E"], "\uA780", "\uA782", "\uA784", "\uA786", "\uA78B", "\uA78D", "\uA790", "\uA792", "\uA796", "\uA798", "\uA79A", "\uA79C", "\uA79E", "\uA7A0", "\uA7A2", "\uA7A4", "\uA7A6", "\uA7A8", ["\uA7AA", "\uA7AD"], ["\uA7B0", "\uA7B4"], "\uA7B6", ["\uFF21", "\uFF3A"]], false, false);
      var peg$e71 = peg$classExpectation(["\u0903", "\u093B", ["\u093E", "\u0940"], ["\u0949", "\u094C"], ["\u094E", "\u094F"], ["\u0982", "\u0983"], ["\u09BE", "\u09C0"], ["\u09C7", "\u09C8"], ["\u09CB", "\u09CC"], "\u09D7", "\u0A03", ["\u0A3E", "\u0A40"], "\u0A83", ["\u0ABE", "\u0AC0"], "\u0AC9", ["\u0ACB", "\u0ACC"], ["\u0B02", "\u0B03"], "\u0B3E", "\u0B40", ["\u0B47", "\u0B48"], ["\u0B4B", "\u0B4C"], "\u0B57", ["\u0BBE", "\u0BBF"], ["\u0BC1", "\u0BC2"], ["\u0BC6", "\u0BC8"], ["\u0BCA", "\u0BCC"], "\u0BD7", ["\u0C01", "\u0C03"], ["\u0C41", "\u0C44"], ["\u0C82", "\u0C83"], "\u0CBE", ["\u0CC0", "\u0CC4"], ["\u0CC7", "\u0CC8"], ["\u0CCA", "\u0CCB"], ["\u0CD5", "\u0CD6"], ["\u0D02", "\u0D03"], ["\u0D3E", "\u0D40"], ["\u0D46", "\u0D48"], ["\u0D4A", "\u0D4C"], "\u0D57", ["\u0D82", "\u0D83"], ["\u0DCF", "\u0DD1"], ["\u0DD8", "\u0DDF"], ["\u0DF2", "\u0DF3"], ["\u0F3E", "\u0F3F"], "\u0F7F", ["\u102B", "\u102C"], "\u1031", "\u1038", ["\u103B", "\u103C"], ["\u1056", "\u1057"], ["\u1062", "\u1064"], ["\u1067", "\u106D"], ["\u1083", "\u1084"], ["\u1087", "\u108C"], "\u108F", ["\u109A", "\u109C"], "\u17B6", ["\u17BE", "\u17C5"], ["\u17C7", "\u17C8"], ["\u1923", "\u1926"], ["\u1929", "\u192B"], ["\u1930", "\u1931"], ["\u1933", "\u1938"], ["\u1A19", "\u1A1A"], "\u1A55", "\u1A57", "\u1A61", ["\u1A63", "\u1A64"], ["\u1A6D", "\u1A72"], "\u1B04", "\u1B35", "\u1B3B", ["\u1B3D", "\u1B41"], ["\u1B43", "\u1B44"], "\u1B82", "\u1BA1", ["\u1BA6", "\u1BA7"], "\u1BAA", "\u1BE7", ["\u1BEA", "\u1BEC"], "\u1BEE", ["\u1BF2", "\u1BF3"], ["\u1C24", "\u1C2B"], ["\u1C34", "\u1C35"], "\u1CE1", ["\u1CF2", "\u1CF3"], ["\u302E", "\u302F"], ["\uA823", "\uA824"], "\uA827", ["\uA880", "\uA881"], ["\uA8B4", "\uA8C3"], ["\uA952", "\uA953"], "\uA983", ["\uA9B4", "\uA9B5"], ["\uA9BA", "\uA9BB"], ["\uA9BD", "\uA9C0"], ["\uAA2F", "\uAA30"], ["\uAA33", "\uAA34"], "\uAA4D", "\uAA7B", "\uAA7D", "\uAAEB", ["\uAAEE", "\uAAEF"], "\uAAF5", ["\uABE3", "\uABE4"], ["\uABE6", "\uABE7"], ["\uABE9", "\uABEA"], "\uABEC"], false, false);
      var peg$e72 = peg$classExpectation([["\u0300", "\u036F"], ["\u0483", "\u0487"], ["\u0591", "\u05BD"], "\u05BF", ["\u05C1", "\u05C2"], ["\u05C4", "\u05C5"], "\u05C7", ["\u0610", "\u061A"], ["\u064B", "\u065F"], "\u0670", ["\u06D6", "\u06DC"], ["\u06DF", "\u06E4"], ["\u06E7", "\u06E8"], ["\u06EA", "\u06ED"], "\u0711", ["\u0730", "\u074A"], ["\u07A6", "\u07B0"], ["\u07EB", "\u07F3"], ["\u0816", "\u0819"], ["\u081B", "\u0823"], ["\u0825", "\u0827"], ["\u0829", "\u082D"], ["\u0859", "\u085B"], ["\u08E3", "\u0902"], "\u093A", "\u093C", ["\u0941", "\u0948"], "\u094D", ["\u0951", "\u0957"], ["\u0962", "\u0963"], "\u0981", "\u09BC", ["\u09C1", "\u09C4"], "\u09CD", ["\u09E2", "\u09E3"], ["\u0A01", "\u0A02"], "\u0A3C", ["\u0A41", "\u0A42"], ["\u0A47", "\u0A48"], ["\u0A4B", "\u0A4D"], "\u0A51", ["\u0A70", "\u0A71"], "\u0A75", ["\u0A81", "\u0A82"], "\u0ABC", ["\u0AC1", "\u0AC5"], ["\u0AC7", "\u0AC8"], "\u0ACD", ["\u0AE2", "\u0AE3"], "\u0B01", "\u0B3C", "\u0B3F", ["\u0B41", "\u0B44"], "\u0B4D", "\u0B56", ["\u0B62", "\u0B63"], "\u0B82", "\u0BC0", "\u0BCD", "\u0C00", ["\u0C3E", "\u0C40"], ["\u0C46", "\u0C48"], ["\u0C4A", "\u0C4D"], ["\u0C55", "\u0C56"], ["\u0C62", "\u0C63"], "\u0C81", "\u0CBC", "\u0CBF", "\u0CC6", ["\u0CCC", "\u0CCD"], ["\u0CE2", "\u0CE3"], "\u0D01", ["\u0D41", "\u0D44"], "\u0D4D", ["\u0D62", "\u0D63"], "\u0DCA", ["\u0DD2", "\u0DD4"], "\u0DD6", "\u0E31", ["\u0E34", "\u0E3A"], ["\u0E47", "\u0E4E"], "\u0EB1", ["\u0EB4", "\u0EB9"], ["\u0EBB", "\u0EBC"], ["\u0EC8", "\u0ECD"], ["\u0F18", "\u0F19"], "\u0F35", "\u0F37", "\u0F39", ["\u0F71", "\u0F7E"], ["\u0F80", "\u0F84"], ["\u0F86", "\u0F87"], ["\u0F8D", "\u0F97"], ["\u0F99", "\u0FBC"], "\u0FC6", ["\u102D", "\u1030"], ["\u1032", "\u1037"], ["\u1039", "\u103A"], ["\u103D", "\u103E"], ["\u1058", "\u1059"], ["\u105E", "\u1060"], ["\u1071", "\u1074"], "\u1082", ["\u1085", "\u1086"], "\u108D", "\u109D", ["\u135D", "\u135F"], ["\u1712", "\u1714"], ["\u1732", "\u1734"], ["\u1752", "\u1753"], ["\u1772", "\u1773"], ["\u17B4", "\u17B5"], ["\u17B7", "\u17BD"], "\u17C6", ["\u17C9", "\u17D3"], "\u17DD", ["\u180B", "\u180D"], "\u18A9", ["\u1920", "\u1922"], ["\u1927", "\u1928"], "\u1932", ["\u1939", "\u193B"], ["\u1A17", "\u1A18"], "\u1A1B", "\u1A56", ["\u1A58", "\u1A5E"], "\u1A60", "\u1A62", ["\u1A65", "\u1A6C"], ["\u1A73", "\u1A7C"], "\u1A7F", ["\u1AB0", "\u1ABD"], ["\u1B00", "\u1B03"], "\u1B34", ["\u1B36", "\u1B3A"], "\u1B3C", "\u1B42", ["\u1B6B", "\u1B73"], ["\u1B80", "\u1B81"], ["\u1BA2", "\u1BA5"], ["\u1BA8", "\u1BA9"], ["\u1BAB", "\u1BAD"], "\u1BE6", ["\u1BE8", "\u1BE9"], "\u1BED", ["\u1BEF", "\u1BF1"], ["\u1C2C", "\u1C33"], ["\u1C36", "\u1C37"], ["\u1CD0", "\u1CD2"], ["\u1CD4", "\u1CE0"], ["\u1CE2", "\u1CE8"], "\u1CED", "\u1CF4", ["\u1CF8", "\u1CF9"], ["\u1DC0", "\u1DF5"], ["\u1DFC", "\u1DFF"], ["\u20D0", "\u20DC"], "\u20E1", ["\u20E5", "\u20F0"], ["\u2CEF", "\u2CF1"], "\u2D7F", ["\u2DE0", "\u2DFF"], ["\u302A", "\u302D"], ["\u3099", "\u309A"], "\uA66F", ["\uA674", "\uA67D"], ["\uA69E", "\uA69F"], ["\uA6F0", "\uA6F1"], "\uA802", "\uA806", "\uA80B", ["\uA825", "\uA826"], "\uA8C4", ["\uA8E0", "\uA8F1"], ["\uA926", "\uA92D"], ["\uA947", "\uA951"], ["\uA980", "\uA982"], "\uA9B3", ["\uA9B6", "\uA9B9"], "\uA9BC", "\uA9E5", ["\uAA29", "\uAA2E"], ["\uAA31", "\uAA32"], ["\uAA35", "\uAA36"], "\uAA43", "\uAA4C", "\uAA7C", "\uAAB0", ["\uAAB2", "\uAAB4"], ["\uAAB7", "\uAAB8"], ["\uAABE", "\uAABF"], "\uAAC1", ["\uAAEC", "\uAAED"], "\uAAF6", "\uABE5", "\uABE8", "\uABED", "\uFB1E", ["\uFE00", "\uFE0F"], ["\uFE20", "\uFE2F"]], false, false);
      var peg$e73 = peg$classExpectation([["0", "9"], ["\u0660", "\u0669"], ["\u06F0", "\u06F9"], ["\u07C0", "\u07C9"], ["\u0966", "\u096F"], ["\u09E6", "\u09EF"], ["\u0A66", "\u0A6F"], ["\u0AE6", "\u0AEF"], ["\u0B66", "\u0B6F"], ["\u0BE6", "\u0BEF"], ["\u0C66", "\u0C6F"], ["\u0CE6", "\u0CEF"], ["\u0D66", "\u0D6F"], ["\u0DE6", "\u0DEF"], ["\u0E50", "\u0E59"], ["\u0ED0", "\u0ED9"], ["\u0F20", "\u0F29"], ["\u1040", "\u1049"], ["\u1090", "\u1099"], ["\u17E0", "\u17E9"], ["\u1810", "\u1819"], ["\u1946", "\u194F"], ["\u19D0", "\u19D9"], ["\u1A80", "\u1A89"], ["\u1A90", "\u1A99"], ["\u1B50", "\u1B59"], ["\u1BB0", "\u1BB9"], ["\u1C40", "\u1C49"], ["\u1C50", "\u1C59"], ["\uA620", "\uA629"], ["\uA8D0", "\uA8D9"], ["\uA900", "\uA909"], ["\uA9D0", "\uA9D9"], ["\uA9F0", "\uA9F9"], ["\uAA50", "\uAA59"], ["\uABF0", "\uABF9"], ["\uFF10", "\uFF19"]], false, false);
      var peg$e74 = peg$classExpectation([["\u16EE", "\u16F0"], ["\u2160", "\u2182"], ["\u2185", "\u2188"], "\u3007", ["\u3021", "\u3029"], ["\u3038", "\u303A"], ["\uA6E6", "\uA6EF"]], false, false);
      var peg$e75 = peg$classExpectation(["_", ["\u203F", "\u2040"], "\u2054", ["\uFE33", "\uFE34"], ["\uFE4D", "\uFE4F"], "\uFF3F"], false, false);
      var peg$e76 = peg$classExpectation([" ", "\xA0", "\u1680", ["\u2000", "\u200A"], "\u202F", "\u205F", "\u3000"], false, false);
      var peg$f0 = function(imports, topLevelInitializer, initializer, rules) {
        return {
          type: "grammar",
          imports,
          topLevelInitializer,
          initializer,
          rules,
          location: location()
        };
      };
      var peg$f1 = function(imports, body) {
        return [imports, body];
      };
      var peg$f2 = function(code) {
        return {
          type: "top_level_initializer",
          code,
          codeLocation: location()
        };
      };
      var peg$f3 = function(code) {
        return {
          type: "top_level_initializer",
          code,
          codeLocation: location()
        };
      };
      var peg$f4 = function(what, from) {
        return {
          type: "grammar_import",
          what,
          from,
          location: location()
        };
      };
      var peg$f5 = function(from) {
        return {
          type: "grammar_import",
          what: [],
          from,
          location: location()
        };
      };
      var peg$f6 = function(first, others) {
        if (!others) {
          return [first];
        }
        if (Array.isArray(others)) {
          others.unshift(first);
          return others;
        }
        return [first, others];
      };
      var peg$f7 = function(binding) {
        return {
          type: "import_binding_default",
          binding: binding[0],
          location: binding[1]
        };
      };
      var peg$f8 = function(binding) {
        return [{
          type: "import_binding_all",
          binding: binding[0],
          location: binding[1]
        }];
      };
      var peg$f9 = function() {
        return [];
      };
      var peg$f10 = function(rename, binding) {
        return {
          type: "import_binding_rename",
          rename: rename[0],
          renameLocation: rename[1],
          binding: binding[0],
          location: binding[1]
        };
      };
      var peg$f11 = function(binding) {
        return {
          type: "import_binding",
          binding: binding[0],
          location: binding[1]
        };
      };
      var peg$f12 = function(module3) {
        return { type: "import_module_specifier", module: module3, location: location() };
      };
      var peg$f13 = function(id) {
        return [id, location()];
      };
      var peg$f14 = function(id) {
        return [id, location()];
      };
      var peg$f15 = function(id) {
        if (reservedWords.indexOf(id[0]) >= 0) {
          error(`Binding identifier can't be a reserved word "${id[0]}"`, id[1]);
        }
        return id[0];
      };
      var peg$f16 = function(code) {
        return {
          type: "top_level_initializer",
          code: code[0],
          codeLocation: code[1],
          location: location()
        };
      };
      var peg$f17 = function(code) {
        return {
          type: "initializer",
          code: code[0],
          codeLocation: code[1],
          location: location()
        };
      };
      var peg$f18 = function(name, displayName, expression) {
        return {
          type: "rule",
          name: name[0],
          nameLocation: name[1],
          expression: displayName !== null ? {
            type: "named",
            name: displayName,
            expression,
            location: location()
          } : expression,
          location: location()
        };
      };
      var peg$f19 = function(head, tail) {
        return tail.length > 0 ? {
          type: "choice",
          alternatives: [head].concat(tail),
          location: location()
        } : head;
      };
      var peg$f20 = function(expression, code) {
        return code !== null ? {
          type: "action",
          expression,
          code: code[0],
          codeLocation: code[1],
          location: location()
        } : expression;
      };
      var peg$f21 = function(head, tail) {
        return tail.length > 0 || head.type === "labeled" && head.pick ? {
          type: "sequence",
          elements: [head].concat(tail),
          location: location()
        } : head;
      };
      var peg$f22 = function(pluck, label, expression) {
        if (expression.type.startsWith("semantic_")) {
          error('"@" cannot be used on a semantic predicate', pluck);
        }
        return {
          type: "labeled",
          label: label !== null ? label[0] : null,
          // Use location of "@" if label is unavailable
          labelLocation: label !== null ? label[1] : pluck,
          pick: true,
          expression,
          location: location()
        };
      };
      var peg$f23 = function(label, expression) {
        return {
          type: "labeled",
          label: label[0],
          labelLocation: label[1],
          expression,
          location: location()
        };
      };
      var peg$f24 = function() {
        return location();
      };
      var peg$f25 = function(label) {
        if (reservedWords.indexOf(label[0]) >= 0) {
          error(`Label can't be a reserved word "${label[0]}"`, label[1]);
        }
        return label;
      };
      var peg$f26 = function(operator, expression) {
        return {
          type: OPS_TO_PREFIXED_TYPES[operator],
          expression,
          location: location()
        };
      };
      var peg$f27 = function(expression, operator) {
        return {
          type: OPS_TO_SUFFIXED_TYPES[operator],
          expression,
          location: location()
        };
      };
      var peg$f28 = function(expression, boundaries, delimiter) {
        let min = boundaries[0];
        let max = boundaries[1];
        if (max.type === "constant" && max.value === 0) {
          error("The maximum count of repetitions of the rule must be > 0", max.location);
        }
        return {
          type: "repeated",
          min,
          max,
          expression,
          delimiter,
          location: location()
        };
      };
      var peg$f29 = function(min, max) {
        return [
          min !== null ? min : { type: "constant", value: 0 },
          max !== null ? max : { type: "constant", value: null }
        ];
      };
      var peg$f30 = function(exact) {
        return [null, exact];
      };
      var peg$f31 = function(value) {
        return { type: "constant", value, location: location() };
      };
      var peg$f32 = function(value) {
        return { type: "variable", value: value[0], location: location() };
      };
      var peg$f33 = function(value) {
        return {
          type: "function",
          value: value[0],
          codeLocation: value[1],
          location: location()
        };
      };
      var peg$f34 = function(expression) {
        return expression.type === "labeled" || expression.type === "sequence" ? { type: "group", expression, location: location() } : expression;
      };
      var peg$f35 = function(library, name) {
        return {
          type: "library_ref",
          name: name[0],
          library: library[0],
          libraryNumber: -1,
          location: location()
        };
      };
      var peg$f36 = function(name) {
        return { type: "rule_ref", name: name[0], location: location() };
      };
      var peg$f37 = function(operator, code) {
        return {
          type: OPS_TO_SEMANTIC_PREDICATE_TYPES[operator],
          code: code[0],
          codeLocation: code[1],
          location: location()
        };
      };
      var peg$f38 = function(head, tail) {
        return [head + tail.join(""), location()];
      };
      var peg$f39 = function(value, ignoreCase) {
        return {
          type: "literal",
          value,
          ignoreCase: ignoreCase !== null,
          location: location()
        };
      };
      var peg$f40 = function(chars) {
        return chars.join("");
      };
      var peg$f41 = function(chars) {
        return chars.join("");
      };
      var peg$f42 = function(inverted, parts, ignoreCase) {
        return {
          type: "class",
          parts: parts.filter((part) => part !== ""),
          inverted: inverted !== null,
          ignoreCase: ignoreCase !== null,
          location: location()
        };
      };
      var peg$f43 = function(begin, end) {
        if (begin.charCodeAt(0) > end.charCodeAt(0)) {
          error(
            "Invalid character range: " + text() + "."
          );
        }
        return [begin, end];
      };
      var peg$f44 = function() {
        return "";
      };
      var peg$f45 = function() {
        return "\0";
      };
      var peg$f46 = function() {
        return "\b";
      };
      var peg$f47 = function() {
        return "\f";
      };
      var peg$f48 = function() {
        return "\n";
      };
      var peg$f49 = function() {
        return "\r";
      };
      var peg$f50 = function() {
        return "	";
      };
      var peg$f51 = function() {
        return "\v";
      };
      var peg$f52 = function(digits) {
        return String.fromCharCode(parseInt(digits, 16));
      };
      var peg$f53 = function(digits) {
        return String.fromCharCode(parseInt(digits, 16));
      };
      var peg$f54 = function() {
        return { type: "any", location: location() };
      };
      var peg$f55 = function(code) {
        return [code, location()];
      };
      var peg$f56 = function(digits) {
        return parseInt(digits, 10);
      };
      var peg$currPos = options2.peg$currPos | 0;
      var peg$savedPos = peg$currPos;
      var peg$posDetailsCache = [{ line: 1, column: 1 }];
      var peg$maxFailPos = peg$currPos;
      var peg$maxFailExpected = options2.peg$maxFailExpected || [];
      var peg$silentFails = options2.peg$silentFails | 0;
      var peg$result;
      if (options2.startRule) {
        if (!(options2.startRule in peg$startRuleFunctions)) {
          throw new Error(`Can't start parsing from rule "` + options2.startRule + '".');
        }
        peg$startRuleFunction = peg$startRuleFunctions[options2.startRule];
      }
      function text() {
        return input.substring(peg$savedPos, peg$currPos);
      }
      function offset() {
        return peg$savedPos;
      }
      function range() {
        return {
          source: peg$source,
          start: peg$savedPos,
          end: peg$currPos
        };
      }
      function location() {
        return peg$computeLocation(peg$savedPos, peg$currPos);
      }
      function expected(description, location2) {
        location2 = location2 !== void 0 ? location2 : peg$computeLocation(peg$savedPos, peg$currPos);
        throw peg$buildStructuredError(
          [peg$otherExpectation(description)],
          input.substring(peg$savedPos, peg$currPos),
          location2
        );
      }
      function error(message, location2) {
        location2 = location2 !== void 0 ? location2 : peg$computeLocation(peg$savedPos, peg$currPos);
        throw peg$buildSimpleError(message, location2);
      }
      function peg$literalExpectation(text2, ignoreCase) {
        return { type: "literal", text: text2, ignoreCase };
      }
      function peg$classExpectation(parts, inverted, ignoreCase) {
        return { type: "class", parts, inverted, ignoreCase };
      }
      function peg$anyExpectation() {
        return { type: "any" };
      }
      function peg$endExpectation() {
        return { type: "end" };
      }
      function peg$otherExpectation(description) {
        return { type: "other", description };
      }
      function peg$computePosDetails(pos) {
        var details = peg$posDetailsCache[pos];
        var p;
        if (details) {
          return details;
        } else {
          if (pos >= peg$posDetailsCache.length) {
            p = peg$posDetailsCache.length - 1;
          } else {
            p = pos;
            while (!peg$posDetailsCache[--p]) {
            }
          }
          details = peg$posDetailsCache[p];
          details = {
            line: details.line,
            column: details.column
          };
          while (p < pos) {
            if (input.charCodeAt(p) === 10) {
              details.line++;
              details.column = 1;
            } else {
              details.column++;
            }
            p++;
          }
          peg$posDetailsCache[pos] = details;
          return details;
        }
      }
      function peg$computeLocation(startPos, endPos, offset2) {
        var startPosDetails = peg$computePosDetails(startPos);
        var endPosDetails = peg$computePosDetails(endPos);
        var res = {
          source: peg$source,
          start: {
            offset: startPos,
            line: startPosDetails.line,
            column: startPosDetails.column
          },
          end: {
            offset: endPos,
            line: endPosDetails.line,
            column: endPosDetails.column
          }
        };
        if (offset2 && peg$source && typeof peg$source.offset === "function") {
          res.start = peg$source.offset(res.start);
          res.end = peg$source.offset(res.end);
        }
        return res;
      }
      function peg$fail(expected2) {
        if (peg$currPos < peg$maxFailPos) {
          return;
        }
        if (peg$currPos > peg$maxFailPos) {
          peg$maxFailPos = peg$currPos;
          peg$maxFailExpected = [];
        }
        peg$maxFailExpected.push(expected2);
      }
      function peg$buildSimpleError(message, location2) {
        return new peg$SyntaxError(message, null, null, location2);
      }
      function peg$buildStructuredError(expected2, found, location2) {
        return new peg$SyntaxError(
          peg$SyntaxError.buildMessage(expected2, found),
          expected2,
          found,
          location2
        );
      }
      function peg$parseGrammar() {
        var s0, s1, s2, s3, s4, s5, s6, s7, s8;
        s0 = peg$currPos;
        s1 = peg$parseImportDeclarations();
        s2 = peg$currPos;
        s3 = peg$parse__();
        s4 = peg$parseTopLevelInitializer();
        if (s4 !== peg$FAILED) {
          s2 = s4;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        s3 = peg$currPos;
        s4 = peg$parse__();
        s5 = peg$parseInitializer();
        if (s5 !== peg$FAILED) {
          s3 = s5;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        s4 = peg$parse__();
        s5 = [];
        s6 = peg$currPos;
        s7 = peg$parseRule();
        if (s7 !== peg$FAILED) {
          s8 = peg$parse__();
          s6 = s7;
        } else {
          peg$currPos = s6;
          s6 = peg$FAILED;
        }
        if (s6 !== peg$FAILED) {
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$currPos;
            s7 = peg$parseRule();
            if (s7 !== peg$FAILED) {
              s8 = peg$parse__();
              s6 = s7;
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
          }
        } else {
          s5 = peg$FAILED;
        }
        if (s5 !== peg$FAILED) {
          peg$savedPos = s0;
          s0 = peg$f0(s1, s2, s3, s5);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseImportsAndSource() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$parseImportsAsText();
        s2 = peg$parseGrammarBody();
        peg$savedPos = s0;
        s0 = peg$f1(s1, s2);
        return s0;
      }
      function peg$parseGrammarBody() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = [];
        if (input.length > peg$currPos) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e0);
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (input.length > peg$currPos) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e0);
            }
          }
        }
        s1 = input.substring(s1, peg$currPos);
        peg$savedPos = s0;
        s1 = peg$f2(s1);
        s0 = s1;
        return s0;
      }
      function peg$parseImportsAsText() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$parseImportDeclarations();
        s1 = input.substring(s1, peg$currPos);
        peg$savedPos = s0;
        s1 = peg$f3(s1);
        s0 = s1;
        return s0;
      }
      function peg$parseImportDeclarations() {
        var s0, s1;
        s0 = [];
        s1 = peg$parseImportDeclaration();
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parseImportDeclaration();
        }
        return s0;
      }
      function peg$parseImportDeclaration() {
        var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;
        s0 = peg$currPos;
        s1 = peg$parse__();
        if (input.substr(peg$currPos, 6) === peg$c0) {
          s2 = peg$c0;
          peg$currPos += 6;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e1);
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse__();
          s4 = peg$parseImportClause();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse__();
            s6 = peg$parseFromClause();
            if (s6 !== peg$FAILED) {
              s7 = peg$currPos;
              s8 = peg$parse__();
              if (input.charCodeAt(peg$currPos) === 59) {
                s9 = peg$c1;
                peg$currPos++;
              } else {
                s9 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e2);
                }
              }
              if (s9 !== peg$FAILED) {
                s8 = [s8, s9];
                s7 = s8;
              } else {
                peg$currPos = s7;
                s7 = peg$FAILED;
              }
              if (s7 === peg$FAILED) {
                s7 = null;
              }
              peg$savedPos = s0;
              s0 = peg$f4(s4, s6);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parse__();
          if (input.substr(peg$currPos, 6) === peg$c0) {
            s2 = peg$c0;
            peg$currPos += 6;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e1);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parse__();
            s4 = peg$parseModuleSpecifier();
            if (s4 !== peg$FAILED) {
              s5 = peg$currPos;
              s6 = peg$parse__();
              if (input.charCodeAt(peg$currPos) === 59) {
                s7 = peg$c1;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e2);
                }
              }
              if (s7 !== peg$FAILED) {
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              peg$savedPos = s0;
              s0 = peg$f5(s4);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseImportClause() {
        var s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$parseNameSpaceImport();
        if (s0 === peg$FAILED) {
          s0 = peg$parseNamedImports();
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseImportedDefaultBinding();
            if (s1 !== peg$FAILED) {
              s2 = peg$currPos;
              s3 = peg$parse__();
              if (input.charCodeAt(peg$currPos) === 44) {
                s4 = peg$c2;
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e3);
                }
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parse__();
                s6 = peg$parseNameSpaceImport();
                if (s6 === peg$FAILED) {
                  s6 = peg$parseNamedImports();
                }
                if (s6 !== peg$FAILED) {
                  s2 = s6;
                } else {
                  peg$currPos = s2;
                  s2 = peg$FAILED;
                }
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
              if (s2 === peg$FAILED) {
                s2 = null;
              }
              peg$savedPos = s0;
              s0 = peg$f6(s1, s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          }
        }
        return s0;
      }
      function peg$parseImportedDefaultBinding() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseImportedBinding();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f7(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseNameSpaceImport() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 42) {
          s1 = peg$c3;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e4);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.substr(peg$currPos, 2) === peg$c4) {
            s3 = peg$c4;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e5);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            s5 = peg$parseImportedBinding();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f8(s5);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseNamedImports() {
        var s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c6;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e7);
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f9();
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 123) {
            s1 = peg$c5;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e6);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse__();
            s3 = peg$parseImportsList();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse__();
              s5 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 44) {
                s6 = peg$c2;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e3);
                }
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parse__();
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c6;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e7);
                }
              }
              if (s6 !== peg$FAILED) {
                s0 = s3;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseFromClause() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4) === peg$c7) {
          s1 = peg$c7;
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e8);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseModuleSpecifier();
          if (s3 !== peg$FAILED) {
            s0 = s3;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseImportsList() {
        var s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseImportSpecifier();
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$currPos;
          s3 = peg$currPos;
          s4 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c2;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e3);
            }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            s4 = [s4, s5, s6];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s3 = peg$parseImportSpecifier();
            if (s3 === peg$FAILED) {
              peg$currPos = s2;
              s2 = peg$FAILED;
            } else {
              s2 = s3;
            }
          } else {
            s2 = s3;
          }
        }
        if (s1.length < 1) {
          peg$currPos = s0;
          s0 = peg$FAILED;
        } else {
          s0 = s1;
        }
        return s0;
      }
      function peg$parseImportSpecifier() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseModuleExportName();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.substr(peg$currPos, 2) === peg$c4) {
            s3 = peg$c4;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e5);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            s5 = peg$parseImportedBinding();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f10(s1, s5);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseImportedBinding();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f11(s1);
          }
          s0 = s1;
        }
        return s0;
      }
      function peg$parseModuleSpecifier() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseStringLiteral();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f12(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseImportedBinding() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseBindingIdentifier();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f13(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseModuleExportName() {
        var s0, s1;
        s0 = peg$parseIdentifierName();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseStringLiteral();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f14(s1);
          }
          s0 = s1;
        }
        return s0;
      }
      function peg$parseBindingIdentifier() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f15(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseTopLevelInitializer() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseCodeBlock();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c6;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e7);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseEOS();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s0 = peg$f16(s2);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseInitializer() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$parseCodeBlock();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseEOS();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f17(s1);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseRule() {
        var s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$currPos;
          s4 = peg$parseStringLiteral();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse__();
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (input.charCodeAt(peg$currPos) === 61) {
            s4 = peg$c8;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e9);
            }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse__();
            s6 = peg$parseChoiceExpression();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseEOS();
              if (s7 !== peg$FAILED) {
                peg$savedPos = s0;
                s0 = peg$f18(s1, s3, s6);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseChoiceExpression() {
        var s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        s1 = peg$parseActionExpression();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c9;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e10);
            }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            s7 = peg$parseActionExpression();
            if (s7 !== peg$FAILED) {
              s3 = s7;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$parse__();
            if (input.charCodeAt(peg$currPos) === 47) {
              s5 = peg$c9;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e10);
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              s7 = peg$parseActionExpression();
              if (s7 !== peg$FAILED) {
                s3 = s7;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          peg$savedPos = s0;
          s0 = peg$f19(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseActionExpression() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$parseSequenceExpression();
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = peg$parse__();
          s4 = peg$parseCodeBlock();
          if (s4 !== peg$FAILED) {
            s2 = s4;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          peg$savedPos = s0;
          s0 = peg$f20(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseSequenceExpression() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseLabeledExpression();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$parse__();
          s5 = peg$parseLabeledExpression();
          if (s5 !== peg$FAILED) {
            s3 = s5;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$parse__();
            s5 = peg$parseLabeledExpression();
            if (s5 !== peg$FAILED) {
              s3 = s5;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          peg$savedPos = s0;
          s0 = peg$f21(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseLabeledExpression() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parsePluck();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseLabelColon();
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          s3 = peg$parsePrefixedExpression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f22(s1, s2, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseLabelColon();
          if (s1 !== peg$FAILED) {
            s2 = peg$parsePrefixedExpression();
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f23(s1, s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parsePrefixedExpression();
          }
        }
        return s0;
      }
      function peg$parsePluck() {
        var s0, s1;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 64) {
          s1 = peg$c10;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e11);
          }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f24();
        }
        s0 = s1;
        return s0;
      }
      function peg$parseLabelColon() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 58) {
            s3 = peg$c11;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e12);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            peg$savedPos = s0;
            s0 = peg$f25(s1);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parsePrefixedExpression() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parsePrefixedOperator();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseSuffixedExpression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f26(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parseSuffixedExpression();
        }
        return s0;
      }
      function peg$parsePrefixedOperator() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r0.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e13);
          }
        }
        return s0;
      }
      function peg$parseSuffixedExpression() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parsePrimaryExpression();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseSuffixedOperator();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f27(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parseRepeatedExpression();
          if (s0 === peg$FAILED) {
            s0 = peg$parsePrimaryExpression();
          }
        }
        return s0;
      }
      function peg$parseSuffixedOperator() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r1.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e14);
          }
        }
        return s0;
      }
      function peg$parseRepeatedExpression() {
        var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;
        s0 = peg$currPos;
        s1 = peg$parsePrimaryExpression();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 124) {
            s3 = peg$c12;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e15);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            s5 = peg$parseBoundaries();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              s7 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 44) {
                s8 = peg$c2;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e3);
                }
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$parse__();
                s10 = peg$parseChoiceExpression();
                if (s10 !== peg$FAILED) {
                  s11 = peg$parse__();
                  s7 = s10;
                } else {
                  peg$currPos = s7;
                  s7 = peg$FAILED;
                }
              } else {
                peg$currPos = s7;
                s7 = peg$FAILED;
              }
              if (s7 === peg$FAILED) {
                s7 = null;
              }
              if (input.charCodeAt(peg$currPos) === 124) {
                s8 = peg$c12;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e15);
                }
              }
              if (s8 !== peg$FAILED) {
                peg$savedPos = s0;
                s0 = peg$f28(s1, s5, s7);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseBoundaries() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseBoundary();
        if (s1 === peg$FAILED) {
          s1 = null;
        }
        s2 = peg$parse__();
        if (input.substr(peg$currPos, 2) === peg$c13) {
          s3 = peg$c13;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e16);
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse__();
          s5 = peg$parseBoundary();
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          peg$savedPos = s0;
          s0 = peg$f29(s1, s5);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseBoundary();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f30(s1);
          }
          s0 = s1;
        }
        return s0;
      }
      function peg$parseBoundary() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseInteger();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f31(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseIdentifierName();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f32(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseCodeBlock();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$f33(s1);
            }
            s0 = s1;
          }
        }
        return s0;
      }
      function peg$parsePrimaryExpression() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$parseLiteralMatcher();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCharacterClassMatcher();
          if (s0 === peg$FAILED) {
            s0 = peg$parseAnyMatcher();
            if (s0 === peg$FAILED) {
              s0 = peg$parseRuleReferenceExpression();
              if (s0 === peg$FAILED) {
                s0 = peg$parseSemanticPredicateExpression();
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s1 = peg$c14;
                    peg$currPos++;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$e17);
                    }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parse__();
                    s3 = peg$parseChoiceExpression();
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parse__();
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s5 = peg$c15;
                        peg$currPos++;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) {
                          peg$fail(peg$e18);
                        }
                      }
                      if (s5 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s0 = peg$f34(s3);
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                }
              }
            }
          }
        }
        return s0;
      }
      function peg$parseRuleReferenceExpression() {
        var s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s2 = peg$c16;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e19);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseIdentifierName();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f35(s1, s3);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseIdentifierName();
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            peg$silentFails++;
            s3 = peg$currPos;
            s4 = peg$parse__();
            s5 = peg$currPos;
            s6 = peg$parseStringLiteral();
            if (s6 !== peg$FAILED) {
              s7 = peg$parse__();
              s6 = [s6, s7];
              s5 = s6;
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (input.charCodeAt(peg$currPos) === 61) {
              s6 = peg$c8;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e9);
              }
            }
            if (s6 !== peg$FAILED) {
              s4 = [s4, s5, s6];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            peg$silentFails--;
            if (s3 === peg$FAILED) {
              s2 = void 0;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f36(s1);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseSemanticPredicateExpression() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseSemanticPredicateOperator();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseCodeBlock();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f37(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseSemanticPredicateOperator() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r2.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e20);
          }
        }
        return s0;
      }
      function peg$parseSourceCharacter() {
        var s0;
        if (input.length > peg$currPos) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e0);
          }
        }
        return s0;
      }
      function peg$parseWhiteSpace() {
        var s0, s1;
        peg$silentFails++;
        s0 = input.charAt(peg$currPos);
        if (peg$r3.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e22);
          }
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e21);
          }
        }
        return s0;
      }
      function peg$parseLineTerminator() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r4.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e23);
          }
        }
        return s0;
      }
      function peg$parseLineTerminatorSequence() {
        var s0, s1;
        peg$silentFails++;
        if (input.charCodeAt(peg$currPos) === 10) {
          s0 = peg$c17;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e25);
          }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c18) {
            s0 = peg$c18;
            peg$currPos += 2;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e26);
            }
          }
          if (s0 === peg$FAILED) {
            s0 = input.charAt(peg$currPos);
            if (peg$r5.test(s0)) {
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e27);
              }
            }
          }
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e24);
          }
        }
        return s0;
      }
      function peg$parseComment() {
        var s0, s1;
        peg$silentFails++;
        s0 = peg$parseMultiLineComment();
        if (s0 === peg$FAILED) {
          s0 = peg$parseSingleLineComment();
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e28);
          }
        }
        return s0;
      }
      function peg$parseMultiLineComment() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c19) {
          s1 = peg$c19;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e29);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s5 = peg$c20;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e30);
            }
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            if (input.substr(peg$currPos, 2) === peg$c20) {
              s5 = peg$c20;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e30);
              }
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s3 = peg$c20;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e30);
            }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseMultiLineCommentNoLineTerminator() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c19) {
          s1 = peg$c19;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e29);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s5 = peg$c20;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e30);
            }
          }
          if (s5 === peg$FAILED) {
            s5 = peg$parseLineTerminator();
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            if (input.substr(peg$currPos, 2) === peg$c20) {
              s5 = peg$c20;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e30);
              }
            }
            if (s5 === peg$FAILED) {
              s5 = peg$parseLineTerminator();
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s3 = peg$c20;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e30);
            }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseSingleLineComment() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c21) {
          s1 = peg$c21;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e31);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = peg$parseLineTerminator();
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            s5 = peg$parseLineTerminator();
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          s1 = [s1, s2];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseIdentifierName() {
        var s0, s1, s2, s3;
        peg$silentFails++;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierStart();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseIdentifierPart();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseIdentifierPart();
          }
          peg$savedPos = s0;
          s0 = peg$f38(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e32);
          }
        }
        return s0;
      }
      function peg$parseIdentifierStart() {
        var s0, s1, s2;
        s0 = input.charAt(peg$currPos);
        if (peg$r6.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e33);
          }
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseUnicodeEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseIdentifierPart() {
        var s0;
        s0 = peg$parseIdentifierStart();
        if (s0 === peg$FAILED) {
          s0 = input.charAt(peg$currPos);
          if (peg$r7.test(s0)) {
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e35);
            }
          }
        }
        return s0;
      }
      function peg$parseUnicodeLetter() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r8.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e36);
          }
        }
        return s0;
      }
      function peg$parseUnicodeCombiningMark() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r9.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e37);
          }
        }
        return s0;
      }
      function peg$parseLiteralMatcher() {
        var s0, s1, s2;
        peg$silentFails++;
        s0 = peg$currPos;
        s1 = peg$parseStringLiteral();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 105) {
            s2 = peg$c23;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e39);
            }
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          peg$savedPos = s0;
          s0 = peg$f39(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e38);
          }
        }
        return s0;
      }
      function peg$parseStringLiteral() {
        var s0, s1, s2, s3;
        peg$silentFails++;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 34) {
          s1 = peg$c24;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e41);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseDoubleStringCharacter();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseDoubleStringCharacter();
          }
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c24;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e41);
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f40(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 39) {
            s1 = peg$c25;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e42);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parseSingleStringCharacter();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseSingleStringCharacter();
            }
            if (input.charCodeAt(peg$currPos) === 39) {
              s3 = peg$c25;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e42);
              }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f41(s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e40);
          }
        }
        return s0;
      }
      function peg$parseDoubleStringCharacter() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = input.charAt(peg$currPos);
        if (peg$r10.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e43);
          }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [s2, s3];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseLineContinuation();
          }
        }
        return s0;
      }
      function peg$parseSingleStringCharacter() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = input.charAt(peg$currPos);
        if (peg$r11.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e44);
          }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [s2, s3];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseLineContinuation();
          }
        }
        return s0;
      }
      function peg$parseCharacterClassMatcher() {
        var s0, s1, s2, s3, s4, s5;
        peg$silentFails++;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 91) {
          s1 = peg$c26;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e46);
          }
        }
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 94) {
            s2 = peg$c27;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e47);
            }
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          s3 = [];
          s4 = peg$parseClassCharacterRange();
          if (s4 === peg$FAILED) {
            s4 = peg$parseClassCharacter();
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseClassCharacterRange();
            if (s4 === peg$FAILED) {
              s4 = peg$parseClassCharacter();
            }
          }
          if (input.charCodeAt(peg$currPos) === 93) {
            s4 = peg$c28;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e48);
            }
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 105) {
              s5 = peg$c23;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e39);
              }
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            peg$savedPos = s0;
            s0 = peg$f42(s2, s3, s5);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e45);
          }
        }
        return s0;
      }
      function peg$parseClassCharacterRange() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseClassCharacter();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 45) {
            s2 = peg$c29;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e49);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseClassCharacter();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f43(s1, s3);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseClassCharacter() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = input.charAt(peg$currPos);
        if (peg$r12.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e50);
          }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [s2, s3];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseLineContinuation();
          }
        }
        return s0;
      }
      function peg$parseLineContinuation() {
        var s0, s1, s2;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 92) {
          s1 = peg$c22;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e34);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseLineTerminatorSequence();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f44();
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseEscapeSequence() {
        var s0, s1, s2, s3;
        s0 = peg$parseCharacterEscapeSequence();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 48) {
            s1 = peg$c30;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e51);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            peg$silentFails++;
            s3 = peg$parseDecimalDigit();
            peg$silentFails--;
            if (s3 === peg$FAILED) {
              s2 = void 0;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f45();
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseHexEscapeSequence();
            if (s0 === peg$FAILED) {
              s0 = peg$parseUnicodeEscapeSequence();
            }
          }
        }
        return s0;
      }
      function peg$parseCharacterEscapeSequence() {
        var s0;
        s0 = peg$parseSingleEscapeCharacter();
        if (s0 === peg$FAILED) {
          s0 = peg$parseNonEscapeCharacter();
        }
        return s0;
      }
      function peg$parseSingleEscapeCharacter() {
        var s0, s1;
        s0 = input.charAt(peg$currPos);
        if (peg$r13.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e52);
          }
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 98) {
            s1 = peg$c31;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e53);
            }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f46();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 102) {
              s1 = peg$c32;
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e54);
              }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$f47();
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 110) {
                s1 = peg$c33;
                peg$currPos++;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e55);
                }
              }
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$f48();
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 114) {
                  s1 = peg$c34;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e56);
                  }
                }
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$f49();
                }
                s0 = s1;
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 116) {
                    s1 = peg$c35;
                    peg$currPos++;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$e57);
                    }
                  }
                  if (s1 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$f50();
                  }
                  s0 = s1;
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 118) {
                      s1 = peg$c36;
                      peg$currPos++;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) {
                        peg$fail(peg$e58);
                      }
                    }
                    if (s1 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$f51();
                    }
                    s0 = s1;
                  }
                }
              }
            }
          }
        }
        return s0;
      }
      function peg$parseNonEscapeCharacter() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = peg$parseEscapeCharacter();
        if (s3 === peg$FAILED) {
          s3 = peg$parseLineTerminator();
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [s2, s3];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        return s0;
      }
      function peg$parseEscapeCharacter() {
        var s0;
        s0 = peg$parseSingleEscapeCharacter();
        if (s0 === peg$FAILED) {
          s0 = input.charAt(peg$currPos);
          if (peg$r14.test(s0)) {
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e59);
            }
          }
        }
        return s0;
      }
      function peg$parseHexEscapeSequence() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 120) {
          s1 = peg$c37;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e60);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = peg$currPos;
          s4 = peg$parseHexDigit();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseHexDigit();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s2 = input.substring(s2, peg$currPos);
          } else {
            s2 = s3;
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f52(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseUnicodeEscapeSequence() {
        var s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 117) {
          s1 = peg$c38;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e61);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = peg$currPos;
          s4 = peg$parseHexDigit();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseHexDigit();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseHexDigit();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseHexDigit();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s2 = input.substring(s2, peg$currPos);
          } else {
            s2 = s3;
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f53(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseDecimalDigit() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r15.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e62);
          }
        }
        return s0;
      }
      function peg$parseHexDigit() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r16.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e63);
          }
        }
        return s0;
      }
      function peg$parseAnyMatcher() {
        var s0, s1;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 46) {
          s1 = peg$c16;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e19);
          }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f54();
        }
        s0 = s1;
        return s0;
      }
      function peg$parseCodeBlock() {
        var s0, s1, s2, s3;
        peg$silentFails++;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseBareCodeBlock();
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c6;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e7);
            }
          }
          if (s3 !== peg$FAILED) {
            s0 = s2;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e64);
          }
        }
        return s0;
      }
      function peg$parseBareCodeBlock() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseCode();
        peg$savedPos = s0;
        s1 = peg$f55(s1);
        s0 = s1;
        return s0;
      }
      function peg$parseCode() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = [];
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        s5 = input.charAt(peg$currPos);
        if (peg$r17.test(s5)) {
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e65);
          }
        }
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parseSourceCharacter();
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            s5 = input.charAt(peg$currPos);
            if (peg$r17.test(s5)) {
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e65);
              }
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 123) {
            s3 = peg$c5;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e6);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseCode();
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c6;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e7);
              }
            }
            if (s5 !== peg$FAILED) {
              s3 = [s3, s4, s5];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        }
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = input.charAt(peg$currPos);
          if (peg$r17.test(s5)) {
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e65);
            }
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$currPos;
              s4 = peg$currPos;
              peg$silentFails++;
              s5 = input.charAt(peg$currPos);
              if (peg$r17.test(s5)) {
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e65);
                }
              }
              peg$silentFails--;
              if (s5 === peg$FAILED) {
                s4 = void 0;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parseSourceCharacter();
                if (s5 !== peg$FAILED) {
                  s4 = [s4, s5];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            }
          } else {
            s2 = peg$FAILED;
          }
          if (s2 === peg$FAILED) {
            s2 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 123) {
              s3 = peg$c5;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e6);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseCode();
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c6;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e7);
                }
              }
              if (s5 !== peg$FAILED) {
                s3 = [s3, s4, s5];
                s2 = s3;
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          }
        }
        s0 = input.substring(s0, peg$currPos);
        return s0;
      }
      function peg$parseInteger() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = [];
        s3 = peg$parseDecimalDigit();
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseDecimalDigit();
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s1 = input.substring(s1, peg$currPos);
        } else {
          s1 = s2;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f56(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseLl() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r18.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e66);
          }
        }
        return s0;
      }
      function peg$parseLm() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r19.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e67);
          }
        }
        return s0;
      }
      function peg$parseLo() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r20.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e68);
          }
        }
        return s0;
      }
      function peg$parseLt() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r21.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e69);
          }
        }
        return s0;
      }
      function peg$parseLu() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r22.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e70);
          }
        }
        return s0;
      }
      function peg$parseMc() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r23.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e71);
          }
        }
        return s0;
      }
      function peg$parseMn() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r24.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e72);
          }
        }
        return s0;
      }
      function peg$parseNd() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r25.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e73);
          }
        }
        return s0;
      }
      function peg$parseNl() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r26.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e74);
          }
        }
        return s0;
      }
      function peg$parsePc() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r27.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e75);
          }
        }
        return s0;
      }
      function peg$parseZs() {
        var s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r28.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e76);
          }
        }
        return s0;
      }
      function peg$parse__() {
        var s0, s1;
        s0 = [];
        s1 = peg$parseWhiteSpace();
        if (s1 === peg$FAILED) {
          s1 = peg$parseLineTerminatorSequence();
          if (s1 === peg$FAILED) {
            s1 = peg$parseComment();
          }
        }
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parseWhiteSpace();
          if (s1 === peg$FAILED) {
            s1 = peg$parseLineTerminatorSequence();
            if (s1 === peg$FAILED) {
              s1 = peg$parseComment();
            }
          }
        }
        return s0;
      }
      function peg$parse_() {
        var s0, s1;
        s0 = [];
        s1 = peg$parseWhiteSpace();
        if (s1 === peg$FAILED) {
          s1 = peg$parseMultiLineCommentNoLineTerminator();
        }
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parseWhiteSpace();
          if (s1 === peg$FAILED) {
            s1 = peg$parseMultiLineCommentNoLineTerminator();
          }
        }
        return s0;
      }
      function peg$parseEOS() {
        var s0, s1, s2, s3;
        s0 = [];
        s1 = peg$currPos;
        s2 = peg$parse__();
        if (input.charCodeAt(peg$currPos) === 59) {
          s3 = peg$c1;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e2);
          }
        }
        if (s3 !== peg$FAILED) {
          s2 = [s2, s3];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          while (s1 !== peg$FAILED) {
            s0.push(s1);
            s1 = peg$currPos;
            s2 = peg$parse__();
            if (input.charCodeAt(peg$currPos) === 59) {
              s3 = peg$c1;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e2);
              }
            }
            if (s3 !== peg$FAILED) {
              s2 = [s2, s3];
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$FAILED;
            }
          }
        } else {
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parse_();
          s2 = peg$parseSingleLineComment();
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          s3 = peg$parseLineTerminatorSequence();
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parse__();
            s2 = peg$parseEOF();
            if (s2 !== peg$FAILED) {
              s1 = [s1, s2];
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          }
        }
        return s0;
      }
      function peg$parseEOF() {
        var s0, s1;
        s0 = peg$currPos;
        peg$silentFails++;
        if (input.length > peg$currPos) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e0);
          }
        }
        peg$silentFails--;
        if (s1 === peg$FAILED) {
          s0 = void 0;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      const reservedWords = options2.reservedWords || [];
      peg$result = peg$startRuleFunction();
      if (options2.peg$library) {
        return (
          /** @type {any} */
          {
            peg$result,
            peg$currPos,
            peg$FAILED,
            peg$maxFailExpected,
            peg$maxFailPos
          }
        );
      }
      if (peg$result !== peg$FAILED && peg$currPos === input.length) {
        return peg$result;
      } else {
        if (peg$result !== peg$FAILED && peg$currPos < input.length) {
          peg$fail(peg$endExpectation());
        }
        throw peg$buildStructuredError(
          peg$maxFailExpected,
          peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
          peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
        );
      }
    }
    module2.exports = {
      StartRules: ["Grammar", "ImportsAndSource"],
      SyntaxError: peg$SyntaxError,
      parse: peg$parse
    };
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/generate-js.js
var require_generate_js = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/generate-js.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var op = require_opcodes();
    var Stack = require_stack();
    var { version } = require_version();
    var { stringEscape, regexpClassEscape } = require_utils();
    var { SourceNode } = require_source_map();
    var GrammarLocation = require_grammar_location();
    var { parse: parse2 } = require_parser();
    function toSourceNode(code, location, name) {
      const start = GrammarLocation.offsetStart(location);
      const line = start.line;
      const column = start.column - 1;
      const lines = code.split("\n");
      if (lines.length === 1) {
        return new SourceNode(
          line,
          column,
          String(location.source),
          code,
          name
        );
      }
      return new SourceNode(
        null,
        null,
        String(location.source),
        lines.map((l, i) => new SourceNode(
          line + i,
          i === 0 ? column : 0,
          String(location.source),
          i === lines.length - 1 ? l : [l, "\n"],
          name
        ))
      );
    }
    function wrapInSourceNode(prefix, chunk, location, suffix, name) {
      if (location) {
        const end = GrammarLocation.offsetEnd(location);
        return new SourceNode(null, null, String(location.source), [
          prefix,
          toSourceNode(chunk, location, name),
          // Mark end location with column information otherwise
          // mapping will be always continue to the end of line
          new SourceNode(
            end.line,
            // `source-map` columns are 0-based, peggy columns is 1-based
            end.column - 1,
            String(location.source),
            suffix
          )
        ]);
      }
      return new SourceNode(null, null, null, [prefix, chunk, suffix]);
    }
    function generateJS2(ast2, options2) {
      if (!ast2.literals || !ast2.locations || !ast2.classes || !ast2.expectations || !ast2.functions || !ast2.importedNames) {
        throw new Error(
          "generateJS: generate bytecode was not called."
        );
      }
      const {
        literals,
        locations,
        classes,
        expectations,
        functions,
        importedNames
      } = ast2;
      if (!options2.allowedStartRules) {
        throw new Error(
          "generateJS: options.allowedStartRules was not set."
        );
      }
      const { allowedStartRules } = options2;
      const dependencies = options2.dependencies || {};
      function indent2(code) {
        let sawEol = true;
        let inSourceNode = 0;
        function helper(code2) {
          if (Array.isArray(code2)) {
            return code2.map((s) => helper(s));
          }
          if (code2 instanceof SourceNode) {
            inSourceNode++;
            code2.children = helper(code2.children);
            inSourceNode--;
            return code2;
          }
          if (sawEol) {
            code2 = code2.replace(/^(.+)$/gm, "  $1");
          } else {
            code2 = code2.replace(/\n(\s*\S)/g, "\n  $1");
          }
          sawEol = !inSourceNode || code2.endsWith("\n");
          return code2;
        }
        return helper(code);
      }
      function l(i) {
        return "peg$c" + i;
      }
      function r(i) {
        return "peg$r" + i;
      }
      function e(i) {
        return "peg$e" + i;
      }
      function f(i) {
        return "peg$f" + i;
      }
      function gi(i) {
        return "peg$import" + i;
      }
      function name(name2) {
        return "peg$parse" + name2;
      }
      function generateTables() {
        function buildLiteral(literal) {
          return '"' + stringEscape(literal) + '"';
        }
        function buildRegexp(cls) {
          return "/^[" + (cls.inverted ? "^" : "") + cls.value.map((part) => Array.isArray(part) ? regexpClassEscape(part[0]) + "-" + regexpClassEscape(part[1]) : regexpClassEscape(part)).join("") + "]/" + (cls.ignoreCase ? "i" : "");
        }
        function buildExpectation(e2) {
          switch (e2.type) {
            case "rule": {
              return 'peg$otherExpectation("' + stringEscape(e2.value) + '")';
            }
            case "literal": {
              return 'peg$literalExpectation("' + stringEscape(e2.value) + '", ' + e2.ignoreCase + ")";
            }
            case "class": {
              const parts = e2.value.map((part) => Array.isArray(part) ? '["' + stringEscape(part[0]) + '", "' + stringEscape(part[1]) + '"]' : '"' + stringEscape(part) + '"').join(", ");
              return "peg$classExpectation([" + parts + "], " + e2.inverted + ", " + e2.ignoreCase + ")";
            }
            case "any":
              return "peg$anyExpectation()";
            // istanbul ignore next Because we never generate expectation type we cannot reach this branch
            default:
              throw new Error("Unknown expectation type (" + JSON.stringify(e2) + ")");
          }
        }
        function buildFunc(a, i) {
          return wrapInSourceNode(
            `
  var ${f(i)} = function(${a.params.join(", ")}) {`,
            a.body,
            a.location,
            "};"
          );
        }
        return new SourceNode(
          null,
          null,
          options2.grammarSource,
          [
            literals.map(
              (c, i) => "  var " + l(i) + " = " + buildLiteral(c) + ";"
            ).concat("", classes.map(
              (c, i) => "  var " + r(i) + " = " + buildRegexp(c) + ";"
            )).concat("", expectations.map(
              (c, i) => "  var " + e(i) + " = " + buildExpectation(c) + ";"
            )).concat("").join("\n"),
            ...functions.map(buildFunc)
          ]
        );
      }
      function generateRuleHeader(ruleNameCode, ruleIndexCode) {
        const parts = [];
        parts.push("");
        if (options2.trace) {
          parts.push(
            "peg$tracer.trace({",
            '  type: "rule.enter",',
            "  rule: " + ruleNameCode + ",",
            "  location: peg$computeLocation(startPos, startPos, true)",
            "});",
            ""
          );
        }
        if (options2.cache) {
          parts.push(
            "var key = peg$currPos * " + ast2.rules.length + " + " + ruleIndexCode + ";",
            "var cached = peg$resultsCache[key];",
            "",
            "if (cached) {",
            "  peg$currPos = cached.nextPos;",
            ""
          );
          if (options2.trace) {
            parts.push(
              "if (cached.result !== peg$FAILED) {",
              "  peg$tracer.trace({",
              '    type: "rule.match",',
              "    rule: " + ruleNameCode + ",",
              "    result: cached.result,",
              "    location: peg$computeLocation(startPos, peg$currPos, true)",
              "  });",
              "} else {",
              "  peg$tracer.trace({",
              '    type: "rule.fail",',
              "    rule: " + ruleNameCode + ",",
              "    location: peg$computeLocation(startPos, startPos, true)",
              "  });",
              "}",
              ""
            );
          }
          parts.push(
            "  return cached.result;",
            "}",
            ""
          );
        }
        return parts;
      }
      function generateRuleFooter(ruleNameCode, resultCode) {
        const parts = [];
        if (options2.cache) {
          parts.push(
            "",
            "peg$resultsCache[key] = { nextPos: peg$currPos, result: " + resultCode + " };"
          );
        }
        if (options2.trace) {
          parts.push(
            "",
            "if (" + resultCode + " !== peg$FAILED) {",
            "  peg$tracer.trace({",
            '    type: "rule.match",',
            "    rule: " + ruleNameCode + ",",
            "    result: " + resultCode + ",",
            "    location: peg$computeLocation(startPos, peg$currPos, true)",
            "  });",
            "} else {",
            "  peg$tracer.trace({",
            '    type: "rule.fail",',
            "    rule: " + ruleNameCode + ",",
            "    location: peg$computeLocation(startPos, startPos, true)",
            "  });",
            "}"
          );
        }
        parts.push(
          "",
          "return " + resultCode + ";"
        );
        return parts;
      }
      function generateRuleFunction(rule) {
        const parts = [];
        const bytecode = (
          /** @type {number[]} */
          rule.bytecode
        );
        const stack = new Stack(rule.name, "s", "var", bytecode);
        function compile2(bc) {
          let ip = 0;
          const end = bc.length;
          const parts2 = [];
          let value = void 0;
          function compileCondition(cond, argCount, thenFn) {
            const baseLength = argCount + 3;
            const thenLength = bc[ip + baseLength - 2];
            const elseLength = bc[ip + baseLength - 1];
            const [thenCode, elseCode] = stack.checkedIf(
              ip,
              () => {
                ip += baseLength + thenLength;
                return (thenFn || compile2)(bc.slice(ip - thenLength, ip));
              },
              elseLength > 0 ? () => {
                ip += elseLength;
                return compile2(bc.slice(ip - elseLength, ip));
              } : null
            );
            parts2.push("if (" + cond + ") {");
            parts2.push(...indent2(thenCode));
            if (elseLength > 0) {
              parts2.push("} else {");
              parts2.push(...indent2(elseCode));
            }
            parts2.push("}");
          }
          function compileInputChunkCondition(condFn, argCount, inputChunkLength) {
            const baseLength = argCount + 3;
            let inputChunk = inputChunkLength === 1 ? "input.charAt(peg$currPos)" : "input.substr(peg$currPos, " + inputChunkLength + ")";
            let thenFn = null;
            if (bc[ip + baseLength] === op.ACCEPT_N && bc[ip + baseLength + 1] === inputChunkLength) {
              parts2.push(stack.push(inputChunk));
              inputChunk = stack.pop();
              thenFn = (bc2) => {
                stack.sp++;
                const code2 = compile2(bc2.slice(2));
                code2.unshift(
                  inputChunkLength === 1 ? "peg$currPos++;" : "peg$currPos += " + inputChunkLength + ";"
                );
                return code2;
              };
            }
            compileCondition(condFn(inputChunk, thenFn !== null), argCount, thenFn);
          }
          function compileLoop(cond) {
            const baseLength = 2;
            const bodyLength = bc[ip + baseLength - 1];
            const bodyCode = stack.checkedLoop(ip, () => {
              ip += baseLength + bodyLength;
              return compile2(bc.slice(ip - bodyLength, ip));
            });
            parts2.push("while (" + cond + ") {");
            parts2.push(...indent2(bodyCode));
            parts2.push("}");
          }
          function compileCall(baseLength) {
            const paramsLength = bc[ip + baseLength - 1];
            return f(bc[ip + 1]) + "(" + bc.slice(ip + baseLength, ip + baseLength + paramsLength).map(
              (p) => stack.index(p)
            ).join(", ") + ")";
          }
          while (ip < end) {
            switch (bc[ip]) {
              case op.PUSH_EMPTY_STRING:
                parts2.push(stack.push("''"));
                ip++;
                break;
              case op.PUSH_CURR_POS:
                parts2.push(stack.push("peg$currPos"));
                ip++;
                break;
              case op.PUSH_UNDEFINED:
                parts2.push(stack.push("undefined"));
                ip++;
                break;
              case op.PUSH_NULL:
                parts2.push(stack.push("null"));
                ip++;
                break;
              case op.PUSH_FAILED:
                parts2.push(stack.push("peg$FAILED"));
                ip++;
                break;
              case op.PUSH_EMPTY_ARRAY:
                parts2.push(stack.push("[]"));
                ip++;
                break;
              case op.POP:
                stack.pop();
                ip++;
                break;
              case op.POP_CURR_POS:
                parts2.push("peg$currPos = " + stack.pop() + ";");
                ip++;
                break;
              case op.POP_N:
                stack.pop(bc[ip + 1]);
                ip += 2;
                break;
              case op.NIP:
                value = stack.pop();
                stack.pop();
                parts2.push(stack.push(value));
                ip++;
                break;
              case op.APPEND:
                value = stack.pop();
                parts2.push(stack.top() + ".push(" + value + ");");
                ip++;
                break;
              case op.WRAP:
                parts2.push(
                  stack.push("[" + stack.pop(bc[ip + 1]).join(", ") + "]")
                );
                ip += 2;
                break;
              case op.TEXT:
                parts2.push(
                  stack.push("input.substring(" + stack.pop() + ", peg$currPos)")
                );
                ip++;
                break;
              case op.PLUCK: {
                const baseLength = 3;
                const paramsLength = bc[ip + baseLength - 1];
                const n = baseLength + paramsLength;
                value = bc.slice(ip + baseLength, ip + n);
                value = paramsLength === 1 ? stack.index(value[0]) : `[ ${value.map((p) => stack.index(p)).join(", ")} ]`;
                stack.pop(bc[ip + 1]);
                parts2.push(stack.push(value));
                ip += n;
                break;
              }
              case op.IF:
                compileCondition(stack.top(), 0);
                break;
              case op.IF_ERROR:
                compileCondition(stack.top() + " === peg$FAILED", 0);
                break;
              case op.IF_NOT_ERROR:
                compileCondition(stack.top() + " !== peg$FAILED", 0);
                break;
              case op.IF_LT:
                compileCondition(stack.top() + ".length < " + bc[ip + 1], 1);
                break;
              case op.IF_GE:
                compileCondition(stack.top() + ".length >= " + bc[ip + 1], 1);
                break;
              case op.IF_LT_DYNAMIC:
                compileCondition(stack.top() + ".length < (" + stack.index(bc[ip + 1]) + "|0)", 1);
                break;
              case op.IF_GE_DYNAMIC:
                compileCondition(stack.top() + ".length >= (" + stack.index(bc[ip + 1]) + "|0)", 1);
                break;
              case op.WHILE_NOT_ERROR:
                compileLoop(stack.top() + " !== peg$FAILED");
                break;
              case op.MATCH_ANY:
                compileCondition("input.length > peg$currPos", 0);
                break;
              case op.MATCH_STRING: {
                const litNum = bc[ip + 1];
                const literal = literals[litNum];
                compileInputChunkCondition(
                  (inputChunk, optimized) => {
                    if (literal.length > 1) {
                      return `${inputChunk} === ${l(litNum)}`;
                    }
                    inputChunk = !optimized ? "input.charCodeAt(peg$currPos)" : `${inputChunk}.charCodeAt(0)`;
                    return `${inputChunk} === ${literal.charCodeAt(0)}`;
                  },
                  1,
                  literal.length
                );
                break;
              }
              case op.MATCH_STRING_IC: {
                const litNum = bc[ip + 1];
                compileInputChunkCondition(
                  (inputChunk) => `${inputChunk}.toLowerCase() === ${l(litNum)}`,
                  1,
                  literals[litNum].length
                );
                break;
              }
              case op.MATCH_CHAR_CLASS: {
                const regNum = bc[ip + 1];
                compileInputChunkCondition(
                  (inputChunk) => `${r(regNum)}.test(${inputChunk})`,
                  1,
                  1
                );
                break;
              }
              case op.ACCEPT_N:
                parts2.push(stack.push(
                  bc[ip + 1] > 1 ? "input.substr(peg$currPos, " + bc[ip + 1] + ")" : "input.charAt(peg$currPos)"
                ));
                parts2.push(
                  bc[ip + 1] > 1 ? "peg$currPos += " + bc[ip + 1] + ";" : "peg$currPos++;"
                );
                ip += 2;
                break;
              case op.ACCEPT_STRING:
                parts2.push(stack.push(l(bc[ip + 1])));
                parts2.push(
                  literals[bc[ip + 1]].length > 1 ? "peg$currPos += " + literals[bc[ip + 1]].length + ";" : "peg$currPos++;"
                );
                ip += 2;
                break;
              case op.FAIL:
                parts2.push(stack.push("peg$FAILED"));
                parts2.push("if (peg$silentFails === 0) { peg$fail(" + e(bc[ip + 1]) + "); }");
                ip += 2;
                break;
              case op.LOAD_SAVED_POS:
                parts2.push("peg$savedPos = " + stack.index(bc[ip + 1]) + ";");
                ip += 2;
                break;
              case op.UPDATE_SAVED_POS:
                parts2.push("peg$savedPos = peg$currPos;");
                ip++;
                break;
              case op.CALL:
                value = compileCall(4);
                stack.pop(bc[ip + 2]);
                parts2.push(stack.push(value));
                ip += 4 + bc[ip + 3];
                break;
              case op.RULE:
                parts2.push(stack.push(name(ast2.rules[bc[ip + 1]].name) + "()"));
                ip += 2;
                break;
              case op.LIBRARY_RULE: {
                const nm = bc[ip + 2];
                const cnm = nm === -1 ? "" : ', "' + importedNames[nm] + '"';
                parts2.push(stack.push("peg$callLibrary(" + gi(bc[ip + 1]) + cnm + ")"));
                ip += 3;
                break;
              }
              case op.SILENT_FAILS_ON:
                parts2.push("peg$silentFails++;");
                ip++;
                break;
              case op.SILENT_FAILS_OFF:
                parts2.push("peg$silentFails--;");
                ip++;
                break;
              case op.SOURCE_MAP_PUSH:
                stack.sourceMapPush(
                  parts2,
                  locations[bc[ip + 1]]
                );
                ip += 2;
                break;
              case op.SOURCE_MAP_POP: {
                stack.sourceMapPop();
                ip++;
                break;
              }
              case op.SOURCE_MAP_LABEL_PUSH:
                stack.labels[bc[ip + 1]] = {
                  label: literals[bc[ip + 2]],
                  location: locations[bc[ip + 3]]
                };
                ip += 4;
                break;
              case op.SOURCE_MAP_LABEL_POP:
                delete stack.labels[bc[ip + 1]];
                ip += 2;
                break;
              // istanbul ignore next Because we never generate invalid bytecode we cannot reach this branch
              default:
                throw new Error("Invalid opcode: " + bc[ip] + ".");
            }
          }
          return parts2;
        }
        const code = compile2(bytecode);
        parts.push(wrapInSourceNode(
          "function ",
          name(rule.name),
          rule.nameLocation,
          "() {\n",
          rule.name
        ));
        if (options2.trace) {
          parts.push("  var startPos = peg$currPos;");
        }
        parts.push(indent2(stack.defines()));
        parts.push(...indent2(generateRuleHeader(
          '"' + stringEscape(rule.name) + '"',
          asts.indexOfRule(ast2, rule.name)
        )));
        parts.push(...indent2(code));
        parts.push(...indent2(generateRuleFooter(
          '"' + stringEscape(rule.name) + '"',
          stack.result()
        )));
        parts.push("}");
        return parts;
      }
      function ast2SourceNode(node) {
        if (node.codeLocation) {
          return toSourceNode(node.code, node.codeLocation, "$" + node.type);
        }
        return node.code;
      }
      function generateToplevel() {
        const parts = [];
        let topLevel = ast2.topLevelInitializer;
        if (topLevel) {
          if (Array.isArray(topLevel)) {
            if (options2.format === "es") {
              const imps = [];
              const codes = [];
              for (const tli of topLevel) {
                const [
                  imports,
                  code
                ] = (
                  /** @type {PEG.ast.TopLevelInitializer[]} */
                  parse2(tli.code, {
                    startRule: "ImportsAndSource",
                    grammarSource: new GrammarLocation(
                      tli.codeLocation.source,
                      tli.codeLocation.start
                    )
                  })
                );
                if (imports.code) {
                  imps.push(imports);
                  codes.push(code);
                } else {
                  codes.push(tli);
                }
              }
              topLevel = codes.concat(imps);
            }
            const reversed = topLevel.slice(0).reverse();
            for (const tli of reversed) {
              parts.push(ast2SourceNode(tli));
              parts.push("");
            }
          } else {
            parts.push(ast2SourceNode(topLevel));
            parts.push("");
          }
        }
        parts.push(
          "function peg$subclass(child, parent) {",
          "  function C() { this.constructor = child; }",
          "  C.prototype = parent.prototype;",
          "  child.prototype = new C();",
          "}",
          "",
          "function peg$SyntaxError(message, expected, found, location) {",
          "  var self = Error.call(this, message);",
          "  // istanbul ignore next Check is a necessary evil to support older environments",
          "  if (Object.setPrototypeOf) {",
          "    Object.setPrototypeOf(self, peg$SyntaxError.prototype);",
          "  }",
          "  self.expected = expected;",
          "  self.found = found;",
          "  self.location = location;",
          '  self.name = "SyntaxError";',
          "  return self;",
          "}",
          "",
          "peg$subclass(peg$SyntaxError, Error);",
          "",
          "function peg$padEnd(str, targetLength, padString) {",
          '  padString = padString || " ";',
          "  if (str.length > targetLength) { return str; }",
          "  targetLength -= str.length;",
          "  padString += padString.repeat(targetLength);",
          "  return str + padString.slice(0, targetLength);",
          "}",
          "",
          "peg$SyntaxError.prototype.format = function(sources) {",
          '  var str = "Error: " + this.message;',
          "  if (this.location) {",
          "    var src = null;",
          "    var k;",
          "    for (k = 0; k < sources.length; k++) {",
          "      if (sources[k].source === this.location.source) {",
          "        src = sources[k].text.split(/\\r\\n|\\n|\\r/g);",
          "        break;",
          "      }",
          "    }",
          "    var s = this.location.start;",
          '    var offset_s = (this.location.source && (typeof this.location.source.offset === "function"))',
          "      ? this.location.source.offset(s)",
          "      : s;",
          '    var loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;',
          "    if (src) {",
          "      var e = this.location.end;",
          `      var filler = peg$padEnd("", offset_s.line.toString().length, ' ');`,
          "      var line = src[s.line - 1];",
          "      var last = s.line === e.line ? e.column : line.length + 1;",
          "      var hatLen = (last - s.column) || 1;",
          '      str += "\\n --> " + loc + "\\n"',
          '          + filler + " |\\n"',
          '          + offset_s.line + " | " + line + "\\n"',
          `          + filler + " | " + peg$padEnd("", s.column - 1, ' ')`,
          '          + peg$padEnd("", hatLen, "^");',
          "    } else {",
          '      str += "\\n at " + loc;',
          "    }",
          "  }",
          "  return str;",
          "};",
          "",
          "peg$SyntaxError.buildMessage = function(expected, found) {",
          "  var DESCRIBE_EXPECTATION_FNS = {",
          "    literal: function(expectation) {",
          '      return "\\"" + literalEscape(expectation.text) + "\\"";',
          "    },",
          "",
          "    class: function(expectation) {",
          "      var escapedParts = expectation.parts.map(function(part) {",
          "        return Array.isArray(part)",
          '          ? classEscape(part[0]) + "-" + classEscape(part[1])',
          "          : classEscape(part);",
          "      });",
          "",
          '      return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]";',
          "    },",
          "",
          "    any: function() {",
          '      return "any character";',
          "    },",
          "",
          "    end: function() {",
          '      return "end of input";',
          "    },",
          "",
          "    other: function(expectation) {",
          "      return expectation.description;",
          "    }",
          "  };",
          "",
          "  function hex(ch) {",
          "    return ch.charCodeAt(0).toString(16).toUpperCase();",
          "  }",
          "",
          "  function literalEscape(s) {",
          "    return s",
          '      .replace(/\\\\/g, "\\\\\\\\")',
          // Backslash
          '      .replace(/"/g,  "\\\\\\"")',
          // Closing double quote
          '      .replace(/\\0/g, "\\\\0")',
          // Null
          '      .replace(/\\t/g, "\\\\t")',
          // Horizontal tab
          '      .replace(/\\n/g, "\\\\n")',
          // Line feed
          '      .replace(/\\r/g, "\\\\r")',
          // Carriage return
          '      .replace(/[\\x00-\\x0F]/g,          function(ch) { return "\\\\x0" + hex(ch); })',
          '      .replace(/[\\x10-\\x1F\\x7F-\\x9F]/g, function(ch) { return "\\\\x"  + hex(ch); });',
          "  }",
          "",
          "  function classEscape(s) {",
          "    return s",
          '      .replace(/\\\\/g, "\\\\\\\\")',
          // Backslash
          '      .replace(/\\]/g, "\\\\]")',
          // Closing bracket
          '      .replace(/\\^/g, "\\\\^")',
          // Caret
          '      .replace(/-/g,  "\\\\-")',
          // Dash
          '      .replace(/\\0/g, "\\\\0")',
          // Null
          '      .replace(/\\t/g, "\\\\t")',
          // Horizontal tab
          '      .replace(/\\n/g, "\\\\n")',
          // Line feed
          '      .replace(/\\r/g, "\\\\r")',
          // Carriage return
          '      .replace(/[\\x00-\\x0F]/g,          function(ch) { return "\\\\x0" + hex(ch); })',
          '      .replace(/[\\x10-\\x1F\\x7F-\\x9F]/g, function(ch) { return "\\\\x"  + hex(ch); });',
          "  }",
          "",
          "  function describeExpectation(expectation) {",
          "    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);",
          "  }",
          "",
          "  function describeExpected(expected) {",
          "    var descriptions = expected.map(describeExpectation);",
          "    var i, j;",
          "",
          "    descriptions.sort();",
          "",
          "    if (descriptions.length > 0) {",
          "      for (i = 1, j = 1; i < descriptions.length; i++) {",
          "        if (descriptions[i - 1] !== descriptions[i]) {",
          "          descriptions[j] = descriptions[i];",
          "          j++;",
          "        }",
          "      }",
          "      descriptions.length = j;",
          "    }",
          "",
          "    switch (descriptions.length) {",
          "      case 1:",
          "        return descriptions[0];",
          "",
          "      case 2:",
          '        return descriptions[0] + " or " + descriptions[1];',
          "",
          "      default:",
          '        return descriptions.slice(0, -1).join(", ")',
          '          + ", or "',
          "          + descriptions[descriptions.length - 1];",
          "    }",
          "  }",
          "",
          "  function describeFound(found) {",
          '    return found ? "\\"" + literalEscape(found) + "\\"" : "end of input";',
          "  }",
          "",
          '  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";',
          "};",
          ""
        );
        if (options2.trace) {
          parts.push(
            "function peg$DefaultTracer() {",
            "  this.indentLevel = 0;",
            "}",
            "",
            "peg$DefaultTracer.prototype.trace = function(event) {",
            "  var that = this;",
            "",
            "  function log(event) {",
            "    function repeat(string, n) {",
            '       var result = "", i;',
            "",
            "       for (i = 0; i < n; i++) {",
            "         result += string;",
            "       }",
            "",
            "       return result;",
            "    }",
            "",
            "    function pad(string, length) {",
            '      return string + repeat(" ", length - string.length);',
            "    }",
            "",
            '    if (typeof console === "object") {',
            // IE 8-10
            "      console.log(",
            '        event.location.start.line + ":" + event.location.start.column + "-"',
            '          + event.location.end.line + ":" + event.location.end.column + " "',
            '          + pad(event.type, 10) + " "',
            '          + repeat("  ", that.indentLevel) + event.rule',
            "      );",
            "    }",
            "  }",
            "",
            "  switch (event.type) {",
            '    case "rule.enter":',
            "      log(event);",
            "      this.indentLevel++;",
            "      break;",
            "",
            '    case "rule.match":',
            "      this.indentLevel--;",
            "      log(event);",
            "      break;",
            "",
            '    case "rule.fail":',
            "      this.indentLevel--;",
            "      log(event);",
            "      break;",
            "",
            "    default:",
            '      throw new Error("Invalid event type: " + event.type + ".");',
            "  }",
            "};",
            ""
          );
        }
        const startRuleFunctions = "{ " + allowedStartRules.map(
          (r2) => r2 + ": " + name(r2)
        ).join(", ") + " }";
        const startRuleFunction = name(allowedStartRules[0]);
        parts.push(
          "function peg$parse(input, options) {",
          "  options = options !== undefined ? options : {};",
          "",
          "  var peg$FAILED = {};",
          "  var peg$source = options.grammarSource;",
          "",
          "  var peg$startRuleFunctions = " + startRuleFunctions + ";",
          "  var peg$startRuleFunction = " + startRuleFunction + ";",
          "",
          generateTables(),
          "",
          "  var peg$currPos = options.peg$currPos | 0;",
          "  var peg$savedPos = peg$currPos;",
          "  var peg$posDetailsCache = [{ line: 1, column: 1 }];",
          "  var peg$maxFailPos = peg$currPos;",
          "  var peg$maxFailExpected = options.peg$maxFailExpected || [];",
          "  var peg$silentFails = options.peg$silentFails | 0;",
          // 0 = report failures, > 0 = silence failures
          ""
        );
        if (options2.cache) {
          parts.push(
            "  var peg$resultsCache = {};",
            ""
          );
        }
        if (options2.trace) {
          parts.push(
            '  var peg$tracer = "tracer" in options ? options.tracer : new peg$DefaultTracer();',
            ""
          );
        }
        parts.push(
          "  var peg$result;",
          "",
          "  if (options.startRule) {",
          "    if (!(options.startRule in peg$startRuleFunctions)) {",
          `      throw new Error("Can't start parsing from rule \\"" + options.startRule + "\\".");`,
          "    }",
          "",
          "    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];",
          "  }",
          "",
          "  function text() {",
          "    return input.substring(peg$savedPos, peg$currPos);",
          "  }",
          "",
          "  function offset() {",
          "    return peg$savedPos;",
          "  }",
          "",
          "  function range() {",
          "    return {",
          "      source: peg$source,",
          "      start: peg$savedPos,",
          "      end: peg$currPos",
          "    };",
          "  }",
          "",
          "  function location() {",
          "    return peg$computeLocation(peg$savedPos, peg$currPos);",
          "  }",
          "",
          "  function expected(description, location) {",
          "    location = location !== undefined",
          "      ? location",
          "      : peg$computeLocation(peg$savedPos, peg$currPos);",
          "",
          "    throw peg$buildStructuredError(",
          "      [peg$otherExpectation(description)],",
          "      input.substring(peg$savedPos, peg$currPos),",
          "      location",
          "    );",
          "  }",
          "",
          "  function error(message, location) {",
          "    location = location !== undefined",
          "      ? location",
          "      : peg$computeLocation(peg$savedPos, peg$currPos);",
          "",
          "    throw peg$buildSimpleError(message, location);",
          "  }",
          "",
          "  function peg$literalExpectation(text, ignoreCase) {",
          '    return { type: "literal", text: text, ignoreCase: ignoreCase };',
          "  }",
          "",
          "  function peg$classExpectation(parts, inverted, ignoreCase) {",
          '    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };',
          "  }",
          "",
          "  function peg$anyExpectation() {",
          '    return { type: "any" };',
          "  }",
          "",
          "  function peg$endExpectation() {",
          '    return { type: "end" };',
          "  }",
          "",
          "  function peg$otherExpectation(description) {",
          '    return { type: "other", description: description };',
          "  }",
          "",
          "  function peg$computePosDetails(pos) {",
          "    var details = peg$posDetailsCache[pos];",
          "    var p;",
          "",
          "    if (details) {",
          "      return details;",
          "    } else {",
          "      if (pos >= peg$posDetailsCache.length) {",
          "        p = peg$posDetailsCache.length - 1;",
          "      } else {",
          "        p = pos;",
          "        while (!peg$posDetailsCache[--p]) {}",
          "      }",
          "",
          "      details = peg$posDetailsCache[p];",
          "      details = {",
          "        line: details.line,",
          "        column: details.column",
          "      };",
          "",
          "      while (p < pos) {",
          "        if (input.charCodeAt(p) === 10) {",
          "          details.line++;",
          "          details.column = 1;",
          "        } else {",
          "          details.column++;",
          "        }",
          "",
          "        p++;",
          "      }",
          "",
          "      peg$posDetailsCache[pos] = details;",
          "",
          "      return details;",
          "    }",
          "  }",
          "",
          "  function peg$computeLocation(startPos, endPos, offset) {",
          "    var startPosDetails = peg$computePosDetails(startPos);",
          "    var endPosDetails = peg$computePosDetails(endPos);",
          "",
          "    var res = {",
          "      source: peg$source,",
          "      start: {",
          "        offset: startPos,",
          "        line: startPosDetails.line,",
          "        column: startPosDetails.column",
          "      },",
          "      end: {",
          "        offset: endPos,",
          "        line: endPosDetails.line,",
          "        column: endPosDetails.column",
          "      }",
          "    };",
          '    if (offset && peg$source && (typeof peg$source.offset === "function")) {',
          "      res.start = peg$source.offset(res.start);",
          "      res.end = peg$source.offset(res.end);",
          "    }",
          "    return res;",
          "  }",
          "",
          "  function peg$fail(expected) {",
          "    if (peg$currPos < peg$maxFailPos) { return; }",
          "",
          "    if (peg$currPos > peg$maxFailPos) {",
          "      peg$maxFailPos = peg$currPos;",
          "      peg$maxFailExpected = [];",
          "    }",
          "",
          "    peg$maxFailExpected.push(expected);",
          "  }",
          "",
          "  function peg$buildSimpleError(message, location) {",
          "    return new peg$SyntaxError(message, null, null, location);",
          "  }",
          "",
          "  function peg$buildStructuredError(expected, found, location) {",
          "    return new peg$SyntaxError(",
          "      peg$SyntaxError.buildMessage(expected, found),",
          "      expected,",
          "      found,",
          "      location",
          "    );",
          "  }",
          ""
        );
        if (ast2.imports.length > 0) {
          parts.push(
            "  var peg$assign = Object.assign || function(t) {",
            "    var i, s;",
            "    for (i = 1; i < arguments.length; i++) {",
            "      s = arguments[i];",
            "      for (var p in s) {",
            "        if (Object.prototype.hasOwnProperty.call(s, p)) {",
            "          t[p] = s[p];",
            "        }",
            "      }",
            "    }",
            "    return t;",
            "  };",
            "",
            "  function peg$callLibrary(lib, startRule) {",
            "    const opts = peg$assign({}, options, {",
            "      startRule: startRule,",
            "      peg$currPos: peg$currPos,",
            "      peg$silentFails: peg$silentFails,",
            "      peg$library: true,",
            "      peg$maxFailExpected: peg$maxFailExpected",
            "    });",
            "    const res = lib.parse(input, opts);",
            "    peg$currPos = res.peg$currPos;",
            "    peg$maxFailPos = res.peg$maxFailPos;",
            "    peg$maxFailExpected = res.peg$maxFailExpected;",
            "    return (res.peg$result === res.peg$FAILED) ? peg$FAILED : res.peg$result;",
            "  }",
            ""
          );
        }
        ast2.rules.forEach((rule) => {
          parts.push(...indent2(generateRuleFunction(rule)));
          parts.push("");
        });
        if (ast2.initializer) {
          if (Array.isArray(ast2.initializer)) {
            for (const init of ast2.initializer) {
              parts.push(ast2SourceNode(init));
              parts.push("");
            }
          } else {
            parts.push(ast2SourceNode(ast2.initializer));
            parts.push("");
          }
        }
        parts.push(
          "  peg$result = peg$startRuleFunction();",
          "",
          "  if (options.peg$library) {",
          // Hide this from TypeScript.  It's internal-only.
          "    return /** @type {any} */ ({",
          "      peg$result,",
          "      peg$currPos,",
          "      peg$FAILED,",
          "      peg$maxFailExpected,",
          "      peg$maxFailPos",
          "    });",
          "  }",
          "  if (peg$result !== peg$FAILED && peg$currPos === input.length) {",
          "    return peg$result;",
          "  } else {",
          "    if (peg$result !== peg$FAILED && peg$currPos < input.length) {",
          "      peg$fail(peg$endExpectation());",
          "    }",
          "",
          "    throw peg$buildStructuredError(",
          "      peg$maxFailExpected,",
          "      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,",
          "      peg$maxFailPos < input.length",
          "        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)",
          "        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)",
          "    );",
          "  }",
          "}"
        );
        return new SourceNode(
          // This expression has a better readability when on two lines
          // eslint-disable-next-line @stylistic/function-call-argument-newline
          null,
          null,
          options2.grammarSource,
          parts.map((s) => s instanceof SourceNode ? s : s + "\n")
        );
      }
      function generateWrapper(toplevelCode) {
        function generateGeneratedByComment() {
          return [
            `// @generated by Peggy ${version}.`,
            "//",
            "// https://peggyjs.org/"
          ];
        }
        function generateParserObject() {
          const res = ["{"];
          if (options2.trace) {
            res.push("  DefaultTracer: peg$DefaultTracer,");
          }
          if (options2.allowedStartRules) {
            res.push("  StartRules: [" + options2.allowedStartRules.map((r2) => '"' + r2 + '"').join(", ") + "],");
          }
          res.push(
            "  SyntaxError: peg$SyntaxError,",
            "  parse: peg$parse"
          );
          res.push("}");
          return res.join("\n");
        }
        const generators = {
          bare() {
            if (Object.keys(dependencies).length > 0 || ast2.imports.length > 0) {
              throw new Error("Dependencies not supported in format 'bare'.");
            }
            return [
              ...generateGeneratedByComment(),
              "(function() {",
              '  "use strict";',
              "",
              toplevelCode,
              "",
              indent2("return " + generateParserObject() + ";"),
              "})()"
            ];
          },
          commonjs() {
            const dependencyVars = Object.keys(dependencies);
            const parts2 = generateGeneratedByComment();
            parts2.push(
              "",
              '"use strict";',
              ""
            );
            if (dependencyVars.length > 0) {
              dependencyVars.forEach((variable) => {
                parts2.push(
                  "var " + variable + ' = require("' + stringEscape(dependencies[variable]) + '");'
                );
              });
              parts2.push("");
            }
            const impLen = ast2.imports.length;
            for (let i = 0; i < impLen; i++) {
              parts2.push(
                "var " + gi(i) + ' = require("' + stringEscape(ast2.imports[i].from.module) + '");'
              );
            }
            parts2.push(
              "",
              toplevelCode,
              "",
              "module.exports = " + generateParserObject() + ";"
            );
            return parts2;
          },
          es() {
            const dependencyVars = Object.keys(dependencies);
            const parts2 = generateGeneratedByComment();
            parts2.push("");
            if (dependencyVars.length > 0) {
              dependencyVars.forEach((variable) => {
                parts2.push(
                  "import " + variable + ' from "' + stringEscape(dependencies[variable]) + '";'
                );
              });
              parts2.push("");
            }
            for (let i = 0; i < ast2.imports.length; i++) {
              parts2.push(
                "import * as " + gi(i) + ' from "' + stringEscape(ast2.imports[i].from.module) + '";'
              );
            }
            parts2.push(
              "",
              toplevelCode,
              ""
            );
            parts2.push(
              "const peg$allowedStartRules = [",
              "  " + (options2.allowedStartRules ? options2.allowedStartRules.map((r2) => '"' + r2 + '"').join(",\n  ") : ""),
              "];",
              ""
            );
            parts2.push(
              "export {"
            );
            if (options2.trace) {
              parts2.push("  peg$DefaultTracer as DefaultTracer,");
            }
            parts2.push(
              "  peg$allowedStartRules as StartRules,",
              "  peg$SyntaxError as SyntaxError,",
              "  peg$parse as parse",
              "};"
            );
            return parts2;
          },
          amd() {
            if (ast2.imports.length > 0) {
              throw new Error("Imports are not supported in format 'amd'.");
            }
            const dependencyVars = Object.keys(dependencies);
            const dependencyIds = dependencyVars.map((v) => dependencies[v]);
            const deps = "[" + dependencyIds.map(
              (id) => '"' + stringEscape(id) + '"'
            ).join(", ") + "]";
            const params = dependencyVars.join(", ");
            return [
              ...generateGeneratedByComment(),
              "define(" + deps + ", function(" + params + ") {",
              '  "use strict";',
              "",
              toplevelCode,
              "",
              indent2("return " + generateParserObject() + ";"),
              "});"
            ];
          },
          globals() {
            if (Object.keys(dependencies).length > 0 || ast2.imports.length > 0) {
              throw new Error("Dependencies not supported in format 'globals'.");
            }
            if (!options2.exportVar) {
              throw new Error("No export variable defined for format 'globals'.");
            }
            return [
              ...generateGeneratedByComment(),
              "(function(root) {",
              '  "use strict";',
              "",
              toplevelCode,
              "",
              indent2("root." + options2.exportVar + " = " + generateParserObject() + ";"),
              "})(this);"
            ];
          },
          umd() {
            if (ast2.imports.length > 0) {
              throw new Error("Imports are not supported in format 'umd'.");
            }
            const dependencyVars = Object.keys(dependencies);
            const dependencyIds = dependencyVars.map((v) => dependencies[v]);
            const deps = "[" + dependencyIds.map(
              (id) => '"' + stringEscape(id) + '"'
            ).join(", ") + "]";
            const requires = dependencyIds.map(
              (id) => 'require("' + stringEscape(id) + '")'
            ).join(", ");
            const params = dependencyVars.join(", ");
            const parts2 = generateGeneratedByComment();
            parts2.push(
              "(function(root, factory) {",
              '  if (typeof define === "function" && define.amd) {',
              "    define(" + deps + ", factory);",
              '  } else if (typeof module === "object" && module.exports) {',
              "    module.exports = factory(" + requires + ");"
            );
            if (options2.exportVar) {
              parts2.push(
                "  } else {",
                "    root." + options2.exportVar + " = factory();"
              );
            }
            parts2.push(
              "  }",
              "})(this, function(" + params + ") {",
              '  "use strict";',
              "",
              toplevelCode,
              "",
              indent2("return " + generateParserObject() + ";"),
              "});"
            );
            return parts2;
          }
        };
        const parts = generators[options2.format || "bare"]();
        return new SourceNode(
          // eslint-disable-next-line @stylistic/function-call-argument-newline -- This expression has a better readability when on two lines
          null,
          null,
          options2.grammarSource,
          parts.map((s) => s instanceof SourceNode ? s : s + "\n")
        );
      }
      ast2.code = generateWrapper(generateToplevel());
    }
    module2.exports = generateJS2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/remove-proxy-rules.js
var require_remove_proxy_rules = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/remove-proxy-rules.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function removeProxyRules2(ast2, options2, session2) {
      function isProxyRule(node) {
        return node.type === "rule" && node.expression.type === "rule_ref";
      }
      function replaceRuleRefs(ast3, from, to) {
        const replace = visitor2.build({
          rule_ref(node) {
            if (node.name === from) {
              node.name = to;
              session2.info(
                `Proxy rule "${from}" replaced by the rule "${to}"`,
                node.location,
                [{
                  message: "This rule will be used",
                  location: asts.findRule(ast3, to).nameLocation
                }]
              );
            }
          }
        });
        replace(ast3);
      }
      const indices = [];
      ast2.rules.forEach((rule, i) => {
        if (isProxyRule(rule)) {
          replaceRuleRefs(ast2, rule.name, rule.expression.name);
          if (options2.allowedStartRules.indexOf(rule.name) === -1) {
            indices.push(i);
          }
        }
      });
      indices.reverse();
      indices.forEach((i) => {
        ast2.rules.splice(i, 1);
      });
    }
    module2.exports = removeProxyRules2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/merge-character-classes.js
var require_merge_character_classes = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/merge-character-classes.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function cloneOver(target, source) {
      const t = (
        /** @type {Record<string,unknown>} */
        target
      );
      const s = (
        /** @type {Record<string,unknown>} */
        source
      );
      Object.keys(t).forEach((key) => delete t[key]);
      Object.keys(s).forEach((key) => {
        t[key] = s[key];
      });
    }
    function cleanParts(parts) {
      parts.sort((a, b) => {
        const [aStart, aEnd] = Array.isArray(a) ? a : [a, a];
        const [bStart, bEnd] = Array.isArray(b) ? b : [b, b];
        if (aStart !== bStart) {
          return aStart < bStart ? -1 : 1;
        }
        if (aEnd !== bEnd) {
          return aEnd > bEnd ? -1 : 1;
        }
        return 0;
      });
      let prevStart = "";
      let prevEnd = "";
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const [curStart, curEnd] = Array.isArray(part) ? part : [part, part];
        if (curEnd <= prevEnd) {
          parts.splice(i--, 1);
          continue;
        }
        if (prevEnd.charCodeAt(0) + 1 >= curStart.charCodeAt(0)) {
          parts.splice(i--, 1);
          parts[i] = [prevStart, prevEnd = curEnd];
          continue;
        }
        prevStart = curStart;
        prevEnd = curEnd;
      }
      return parts;
    }
    function mergeCharacterClasses2(ast2) {
      const rules = /* @__PURE__ */ Object.create(null);
      ast2.rules.forEach((rule) => rules[rule.name] = rule.expression);
      const processedRules = /* @__PURE__ */ Object.create(null);
      const [asClass, merge] = [
        /**
         * Determine whether a node can be represented as a simple character class,
         * and return that class if so.
         *
         * @param {PEG.ast.Expression} node - the node to inspect
         * @param {boolean} [clone] - if true, always return a new node that
         *                            can be modified by the caller
         * @returns {PEG.ast.CharacterClass | null}
         */
        (node, clone) => {
          if (node.type === "class" && !node.inverted) {
            if (clone) {
              node = { ...node };
              node.parts = [...node.parts];
            }
            return node;
          }
          if (node.type === "literal" && node.value.length === 1) {
            return {
              type: "class",
              parts: [node.value],
              inverted: false,
              ignoreCase: node.ignoreCase,
              location: node.location
            };
          }
          if (node.type === "rule_ref") {
            const ref = rules[node.name];
            if (ref) {
              if (!processedRules[node.name]) {
                processedRules[node.name] = true;
                merge(ref);
              }
              const cls = asClass(ref, true);
              if (cls) {
                cls.location = node.location;
              }
              return cls;
            }
          }
          return null;
        },
        visitor2.build({
          choice(node) {
            let prev = null;
            let changed = false;
            node.alternatives.forEach((alt, i) => {
              merge(alt);
              const cls = asClass(alt);
              if (!cls) {
                prev = null;
                return;
              }
              if (prev && prev.ignoreCase === cls.ignoreCase) {
                prev.parts.push(...cls.parts);
                node.alternatives[i - 1] = prev;
                node.alternatives[i] = prev;
                prev.location = {
                  source: prev.location.source,
                  start: prev.location.start,
                  end: cls.location.end
                };
                changed = true;
              } else {
                prev = cls;
              }
            });
            if (changed) {
              node.alternatives = node.alternatives.filter(
                (alt, i, arr) => !i || alt !== arr[i - 1]
              );
              node.alternatives.forEach((alt, i) => {
                if (alt.type === "class") {
                  alt.parts = cleanParts(alt.parts);
                  if (alt.parts.length === 1 && !Array.isArray(alt.parts[0]) && !alt.inverted) {
                    node.alternatives[i] = {
                      type: "literal",
                      value: alt.parts[0],
                      ignoreCase: alt.ignoreCase,
                      location: alt.location
                    };
                  }
                }
              });
              if (node.alternatives.length === 1) {
                cloneOver(node, node.alternatives[0]);
              }
            }
          },
          text(node) {
            merge(node.expression);
            if (node.expression.type === "class" || node.expression.type === "literal") {
              const location = node.location;
              cloneOver(node, node.expression);
              node.location = location;
            }
          }
        })
      ];
      ast2.rules.forEach((rule) => {
        processedRules[rule.name] = true;
        merge(rule.expression);
      });
    }
    module2.exports = mergeCharacterClasses2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-duplicate-imports.js
var require_report_duplicate_imports = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-duplicate-imports.js"(exports2, module2) {
    "use strict";
    function reportDuplicateImports2(ast2, _options, session2) {
      const all = {};
      for (const imp of ast2.imports) {
        for (const what of imp.what) {
          if (what.type === "import_binding_all") {
            if (Object.prototype.hasOwnProperty.call(all, what.binding)) {
              session2.error(
                `Module "${what.binding}" is already imported`,
                what.location,
                [{
                  message: "Original module location",
                  location: all[what.binding]
                }]
              );
            }
            all[what.binding] = what.location;
          }
        }
      }
    }
    module2.exports = reportDuplicateImports2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-duplicate-labels.js
var require_report_duplicate_labels = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-duplicate-labels.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function reportDuplicateLabels2(ast2, options2, session2) {
      function cloneEnv(env) {
        const clone = {};
        Object.keys(env).forEach((name) => {
          clone[name] = env[name];
        });
        return clone;
      }
      function checkExpressionWithClonedEnv(node, env) {
        check(node.expression, cloneEnv(env));
      }
      const check = visitor2.build({
        rule(node) {
          check(node.expression, {});
        },
        choice(node, env) {
          node.alternatives.forEach((alternative) => {
            check(alternative, cloneEnv(env));
          });
        },
        action: checkExpressionWithClonedEnv,
        labeled(node, env) {
          const label = node.label;
          if (label && Object.prototype.hasOwnProperty.call(env, label)) {
            session2.error(
              `Label "${node.label}" is already defined`,
              node.labelLocation,
              [{
                message: "Original label location",
                location: env[label]
              }]
            );
          }
          check(node.expression, env);
          env[node.label] = node.labelLocation;
        },
        text: checkExpressionWithClonedEnv,
        simple_and: checkExpressionWithClonedEnv,
        simple_not: checkExpressionWithClonedEnv,
        optional: checkExpressionWithClonedEnv,
        zero_or_more: checkExpressionWithClonedEnv,
        one_or_more: checkExpressionWithClonedEnv,
        repeated(node, env) {
          if (node.delimiter) {
            check(node.delimiter, cloneEnv(env));
          }
          check(node.expression, cloneEnv(env));
        },
        group: checkExpressionWithClonedEnv
      });
      check(ast2);
    }
    module2.exports = reportDuplicateLabels2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-duplicate-rules.js
var require_report_duplicate_rules = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-duplicate-rules.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function reportDuplicateRules2(ast2, options2, session2) {
      const rules = {};
      const check = visitor2.build({
        rule(node) {
          if (Object.prototype.hasOwnProperty.call(rules, node.name)) {
            session2.error(
              `Rule "${node.name}" is already defined`,
              node.nameLocation,
              [{
                message: "Original rule location",
                location: rules[node.name]
              }]
            );
            return;
          }
          rules[node.name] = node.nameLocation;
        }
      });
      check(ast2);
    }
    module2.exports = reportDuplicateRules2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-infinite-recursion.js
var require_report_infinite_recursion = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-infinite-recursion.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function reportInfiniteRecursion2(ast2, options2, session2) {
      const visitedRules = [];
      const backtraceRefs = [];
      const check = visitor2.build({
        rule(node) {
          if (session2.errors > 0) {
            return;
          }
          visitedRules.push(node.name);
          check(node.expression);
          visitedRules.pop();
        },
        sequence(node) {
          if (session2.errors > 0) {
            return;
          }
          node.elements.every((element) => {
            check(element);
            if (session2.errors > 0) {
              return false;
            }
            return !asts.alwaysConsumesOnSuccess(ast2, element);
          });
        },
        repeated(node) {
          if (session2.errors > 0) {
            return;
          }
          check(node.expression);
          if (node.delimiter && !asts.alwaysConsumesOnSuccess(ast2, node.expression)) {
            check(node.delimiter);
          }
        },
        rule_ref(node) {
          if (session2.errors > 0) {
            return;
          }
          backtraceRefs.push(node);
          const rule = asts.findRule(ast2, node.name);
          if (visitedRules.indexOf(node.name) !== -1) {
            visitedRules.push(node.name);
            session2.error(
              "Possible infinite loop when parsing (left recursion: " + visitedRules.join(" -> ") + ")",
              rule.nameLocation,
              backtraceRefs.map((ref, i, a) => ({
                message: i + 1 !== a.length ? `Step ${i + 1}: call of the rule "${ref.name}" without input consumption` : `Step ${i + 1}: call itself without input consumption - left recursion`,
                location: ref.location
              }))
            );
            return;
          }
          if (rule) {
            check(rule);
          }
          backtraceRefs.pop();
        }
      });
      check(ast2);
    }
    module2.exports = reportInfiniteRecursion2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-infinite-repetition.js
var require_report_infinite_repetition = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-infinite-repetition.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function reportInfiniteRepetition2(ast2, options2, session2) {
      const check = visitor2.build({
        zero_or_more(node) {
          if (!asts.alwaysConsumesOnSuccess(ast2, node.expression)) {
            session2.error(
              "Possible infinite loop when parsing (repetition used with an expression that may not consume any input)",
              node.location
            );
          }
        },
        one_or_more(node) {
          if (!asts.alwaysConsumesOnSuccess(ast2, node.expression)) {
            session2.error(
              "Possible infinite loop when parsing (repetition used with an expression that may not consume any input)",
              node.location
            );
          }
        },
        repeated(node) {
          if (node.delimiter) {
            check(node.delimiter);
          }
          if (asts.alwaysConsumesOnSuccess(ast2, node.expression) || node.delimiter && asts.alwaysConsumesOnSuccess(ast2, node.delimiter)) {
            return;
          }
          if (node.max.value === null) {
            session2.error(
              "Possible infinite loop when parsing (unbounded range repetition used with an expression that may not consume any input)",
              node.location
            );
          } else {
            const min = node.min ? node.min : node.max;
            session2.warning(
              min.type === "constant" && node.max.type === "constant" ? `An expression may not consume any input and may always match ${node.max.value} times` : "An expression may not consume any input and may always match with a maximum repetition count",
              node.location
            );
          }
        }
      });
      check(ast2);
    }
    module2.exports = reportInfiniteRepetition2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-undefined-rules.js
var require_report_undefined_rules = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-undefined-rules.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function reportUndefinedRules2(ast2, options2, session2) {
      const check = visitor2.build({
        rule_ref(node) {
          if (!asts.findRule(ast2, node.name)) {
            session2.error(
              `Rule "${node.name}" is not defined`,
              node.location
            );
          }
        }
      });
      check(ast2);
    }
    module2.exports = reportUndefinedRules2;
  }
});

// ../../../node_modules/peggy/lib/compiler/passes/report-incorrect-plucking.js
var require_report_incorrect_plucking = __commonJS({
  "../../../node_modules/peggy/lib/compiler/passes/report-incorrect-plucking.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function reportIncorrectPlucking2(ast2, options2, session2) {
      const check = visitor2.build({
        action(node) {
          check(node.expression, node);
        },
        labeled(node, action) {
          if (node.pick) {
            if (action) {
              session2.error(
                '"@" cannot be used with an action block',
                node.labelLocation,
                [{
                  message: "Action block location",
                  location: action.codeLocation
                }]
              );
            }
          }
          check(node.expression);
        }
      });
      check(ast2);
    }
    module2.exports = reportIncorrectPlucking2;
  }
});

// ../../../node_modules/peggy/lib/compiler/session.js
var require_session = __commonJS({
  "../../../node_modules/peggy/lib/compiler/session.js"(exports2, module2) {
    "use strict";
    var GrammarError = require_grammar_error();
    var Defaults = class {
      constructor(options2) {
        options2 = typeof options2 !== "undefined" ? options2 : {};
        if (typeof options2.error === "function") {
          this.error = options2.error;
        }
        if (typeof options2.warning === "function") {
          this.warning = options2.warning;
        }
        if (typeof options2.info === "function") {
          this.info = options2.info;
        }
      }
      // eslint-disable-next-line class-methods-use-this -- Abstract
      error() {
      }
      // eslint-disable-next-line class-methods-use-this -- Abstract
      warning() {
      }
      // eslint-disable-next-line class-methods-use-this -- Abstract
      info() {
      }
    };
    var Session2 = class {
      constructor(options2) {
        this._callbacks = new Defaults(options2);
        this._firstError = null;
        this.errors = 0;
        this.problems = [];
        this.stage = null;
      }
      error(...args) {
        ++this.errors;
        if (this._firstError === null) {
          this._firstError = new GrammarError(...args);
          this._firstError.stage = this.stage;
          this._firstError.problems = this.problems;
        }
        this.problems.push(["error", ...args]);
        this._callbacks.error(this.stage, ...args);
      }
      warning(...args) {
        this.problems.push(["warning", ...args]);
        this._callbacks.warning(this.stage, ...args);
      }
      info(...args) {
        this.problems.push(["info", ...args]);
        this._callbacks.info(this.stage, ...args);
      }
      checkErrors() {
        if (this.errors !== 0) {
          throw this._firstError;
        }
      }
    };
    module2.exports = Session2;
  }
});

// ../../../node_modules/peggy/lib/compiler/index.js
var require_compiler = __commonJS({
  "../../../node_modules/peggy/lib/compiler/index.js"(exports, module) {
    "use strict";
    var addImportedRules = require_add_imported_rules();
    var fixLibraryNumbers = require_fix_library_numbers();
    var generateBytecode = require_generate_bytecode();
    var generateJS = require_generate_js();
    var inferenceMatchResult = require_inference_match_result();
    var removeProxyRules = require_remove_proxy_rules();
    var mergeCharacterClasses = require_merge_character_classes();
    var reportDuplicateImports = require_report_duplicate_imports();
    var reportDuplicateLabels = require_report_duplicate_labels();
    var reportDuplicateRules = require_report_duplicate_rules();
    var reportInfiniteRecursion = require_report_infinite_recursion();
    var reportInfiniteRepetition = require_report_infinite_repetition();
    var reportUndefinedRules = require_report_undefined_rules();
    var reportIncorrectPlucking = require_report_incorrect_plucking();
    var Session = require_session();
    var visitor = require_visitor();
    var { base64 } = require_utils();
    function processOptions(options2, defaults2) {
      const processedOptions = {};
      Object.keys(options2).forEach((name) => {
        processedOptions[name] = options2[name];
      });
      Object.keys(defaults2).forEach((name) => {
        if (!Object.prototype.hasOwnProperty.call(processedOptions, name)) {
          processedOptions[name] = defaults2[name];
        }
      });
      return processedOptions;
    }
    function isSourceMapCapable(target) {
      if (typeof target === "string") {
        return target.length > 0;
      }
      return target && typeof target.offset === "function";
    }
    var compiler = {
      // AST node visitor builder. Useful mainly for plugins which manipulate the
      // AST.
      visitor,
      // Compiler passes.
      //
      // Each pass is a function that is passed the AST. It can perform checks on it
      // or modify it as needed. If the pass encounters a semantic error, it throws
      // |peg.GrammarError|.
      passes: {
        prepare: [
          addImportedRules,
          reportInfiniteRecursion
        ],
        check: [
          reportUndefinedRules,
          reportDuplicateRules,
          reportDuplicateLabels,
          reportInfiniteRepetition,
          reportIncorrectPlucking,
          reportDuplicateImports
        ],
        transform: [
          fixLibraryNumbers,
          removeProxyRules,
          mergeCharacterClasses,
          inferenceMatchResult
        ],
        generate: [
          generateBytecode,
          generateJS
        ]
      },
      // Generates a parser from a specified grammar AST. Throws |peg.GrammarError|
      // if the AST contains a semantic error. Note that not all errors are detected
      // during the generation and some may protrude to the generated parser and
      // cause its malfunction.
      compile(ast, passes, options) {
        options = options !== void 0 ? options : {};
        const defaultStartRules = [ast.rules[0].name];
        options = processOptions(options, {
          allowedStartRules: defaultStartRules,
          cache: false,
          dependencies: {},
          exportVar: null,
          format: "bare",
          output: "parser",
          trace: false
        });
        if (options.allowedStartRules === null || options.allowedStartRules === void 0) {
          options.allowedStartRules = defaultStartRules;
        }
        if (!Array.isArray(options.allowedStartRules)) {
          throw new Error("allowedStartRules must be an array");
        }
        if (options.allowedStartRules.length === 0) {
          options.allowedStartRules = defaultStartRules;
        }
        const allRules = ast.rules.map((r) => r.name);
        if (options.allowedStartRules.some((r) => r === "*")) {
          options.allowedStartRules = allRules;
        } else {
          for (const rule of options.allowedStartRules) {
            if (allRules.indexOf(rule) === -1) {
              throw new Error(`Unknown start rule "${rule}"`);
            }
          }
        }
        if ((options.output === "source-and-map" || options.output === "source-with-inline-map") && !isSourceMapCapable(options.grammarSource)) {
          throw new Error("Must provide grammarSource (as a string or GrammarLocation) in order to generate source maps");
        }
        const session = new Session(options);
        Object.keys(passes).forEach((stage) => {
          session.stage = stage;
          session.info(`Process stage ${stage}`);
          passes[stage].forEach((pass) => {
            session.info(`Process pass ${stage}.${pass.name}`);
            pass(ast, options, session);
          });
          session.checkErrors();
        });
        switch (options.output) {
          case "parser":
            return eval(ast.code.toString());
          case "source":
            return ast.code.toString();
          case "source-and-map":
            return ast.code;
          case "source-with-inline-map": {
            if (typeof TextEncoder === "undefined") {
              throw new Error("TextEncoder is not supported by this platform");
            }
            const sourceMap = ast.code.toStringWithSourceMap();
            const encoder = new TextEncoder();
            const b64 = base64(
              encoder.encode(JSON.stringify(sourceMap.map.toJSON()))
            );
            return sourceMap.code + `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}
`;
          }
          case "ast":
            return ast;
          default:
            throw new Error("Invalid output format: " + options.output + ".");
        }
      }
    };
    module.exports = compiler;
  }
});

// ../../../node_modules/peggy/lib/peg.js
var require_peg = __commonJS({
  "../../../node_modules/peggy/lib/peg.js"(exports2, module2) {
    "use strict";
    var GrammarError = require_grammar_error();
    var GrammarLocation = require_grammar_location();
    var asts = require_asts();
    var compiler2 = require_compiler();
    var parser = require_parser();
    var { version: VERSION } = require_version();
    var RESERVED_WORDS = [
      // Reserved keywords as of ECMAScript 2015
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "export",
      "extends",
      "finally",
      "for",
      "function",
      "if",
      "import",
      "in",
      "instanceof",
      "new",
      "return",
      "super",
      "switch",
      "this",
      "throw",
      "try",
      "typeof",
      "var",
      "void",
      "while",
      "with",
      // Special constants
      "null",
      "true",
      "false",
      // These are always reserved:
      "enum",
      // The following are only reserved when they are found in strict mode code
      // Peggy generates code in strict mode, so they are applicable
      "implements",
      "interface",
      "let",
      "package",
      "private",
      "protected",
      "public",
      "static",
      "yield",
      // The following are only reserved when they are found in module code:
      "await",
      // The following are reserved as future keywords by ECMAScript 1..3
      // specifications, but not any more in modern ECMAScript. We don't need these
      // because the code-generation of Peggy only targets ECMAScript >= 5.
      //
      // - abstract
      // - boolean
      // - byte
      // - char
      // - double
      // - final
      // - float
      // - goto
      // - int
      // - long
      // - native
      // - short
      // - synchronized
      // - throws
      // - transient
      // - volatile
      // These are not reserved keywords, but using them as variable names is problematic.
      "arguments",
      // Conflicts with a special variable available inside functions.
      "eval"
      // Redeclaring eval() is prohibited in strict mode
      // A few identifiers have a special meaning in some contexts without being
      // reserved words of any kind. These we don't need to worry about as they can
      // all be safely used as variable names.
      //
      // - as
      // - async
      // - from
      // - get
      // - of
      // - set
    ];
    var peg = {
      // Peggy version (filled in by /tools/release).
      VERSION,
      /**
       * Default list of reserved words. Contains list of currently and future
       * JavaScript (ECMAScript 2015) reserved words.
       *
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words
       */
      RESERVED_WORDS,
      GrammarError,
      GrammarLocation,
      parser,
      compiler: compiler2,
      // Generates a parser from a specified grammar and returns it.
      //
      // The grammar must be a string in the format described by the meta-grammar in
      // the parser.pegjs file.
      //
      // Throws |peg.parser.SyntaxError| if the grammar contains a syntax error or
      // |peg.GrammarError| if it contains a semantic error. Note that not all
      // errors are detected during the generation and some may protrude to the
      // generated parser and cause its malfunction.
      generate(grammar, options2) {
        options2 = options2 !== void 0 ? options2 : {};
        function copyPasses(passes2) {
          const converted = {};
          Object.keys(passes2).forEach((stage) => {
            converted[stage] = passes2[stage].slice();
          });
          return converted;
        }
        const plugins = "plugins" in options2 ? options2.plugins : [];
        const config = {
          parser: peg.parser,
          passes: copyPasses(peg.compiler.passes),
          reservedWords: peg.RESERVED_WORDS.slice()
        };
        plugins.forEach((p) => {
          p.use(config, options2);
        });
        if (!Array.isArray(grammar)) {
          grammar = [{
            source: options2.grammarSource,
            text: grammar
          }];
        }
        const combined = asts.combine(
          grammar.map(({ source, text }) => config.parser.parse(text, {
            grammarSource: source,
            reservedWords: config.reservedWords
          }))
        );
        return peg.compiler.compile(
          combined,
          config.passes,
          options2
        );
      }
    };
    module2.exports = peg;
  }
});

// ../../../node_modules/postgres-array/index.js
var require_postgres_array = __commonJS({
  "../../../node_modules/postgres-array/index.js"(exports2) {
    "use strict";
    exports2.parse = function(source, transform) {
      return new ArrayParser(source, transform).parse();
    };
    var ArrayParser = class _ArrayParser {
      constructor(source, transform) {
        this.source = source;
        this.transform = transform || identity;
        this.position = 0;
        this.entries = [];
        this.recorded = [];
        this.dimension = 0;
      }
      isEof() {
        return this.position >= this.source.length;
      }
      nextCharacter() {
        var character = this.source[this.position++];
        if (character === "\\") {
          return {
            value: this.source[this.position++],
            escaped: true
          };
        }
        return {
          value: character,
          escaped: false
        };
      }
      record(character) {
        this.recorded.push(character);
      }
      newEntry(includeEmpty) {
        var entry;
        if (this.recorded.length > 0 || includeEmpty) {
          entry = this.recorded.join("");
          if (entry === "NULL" && !includeEmpty) {
            entry = null;
          }
          if (entry !== null) entry = this.transform(entry);
          this.entries.push(entry);
          this.recorded = [];
        }
      }
      consumeDimensions() {
        if (this.source[0] === "[") {
          while (!this.isEof()) {
            var char = this.nextCharacter();
            if (char.value === "=") break;
          }
        }
      }
      parse(nested) {
        var character, parser, quote;
        this.consumeDimensions();
        while (!this.isEof()) {
          character = this.nextCharacter();
          if (character.value === "{" && !quote) {
            this.dimension++;
            if (this.dimension > 1) {
              parser = new _ArrayParser(this.source.substr(this.position - 1), this.transform);
              this.entries.push(parser.parse(true));
              this.position += parser.position - 2;
            }
          } else if (character.value === "}" && !quote) {
            this.dimension--;
            if (!this.dimension) {
              this.newEntry();
              if (nested) return this.entries;
            }
          } else if (character.value === '"' && !character.escaped) {
            if (quote) this.newEntry(true);
            quote = !quote;
          } else if (character.value === "," && !quote) {
            this.newEntry();
          } else {
            this.record(character.value);
          }
        }
        if (this.dimension !== 0) {
          throw new Error("array dimension not balanced");
        }
        return this.entries;
      }
    };
    function identity(value) {
      return value;
    }
  }
});

// ../../../node_modules/pg-types/lib/arrayParser.js
var require_arrayParser = __commonJS({
  "../../../node_modules/pg-types/lib/arrayParser.js"(exports2, module2) {
    var array = require_postgres_array();
    module2.exports = {
      create: function(source, transform) {
        return {
          parse: function() {
            return array.parse(source, transform);
          }
        };
      }
    };
  }
});

// ../../../node_modules/postgres-date/index.js
var require_postgres_date = __commonJS({
  "../../../node_modules/postgres-date/index.js"(exports2, module2) {
    "use strict";
    var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/;
    var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/;
    var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
    var INFINITY = /^-?infinity$/;
    module2.exports = function parseDate(isoDate) {
      if (INFINITY.test(isoDate)) {
        return Number(isoDate.replace("i", "I"));
      }
      var matches = DATE_TIME.exec(isoDate);
      if (!matches) {
        return getDate(isoDate) || null;
      }
      var isBC = !!matches[8];
      var year = parseInt(matches[1], 10);
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var hour = parseInt(matches[4], 10);
      var minute = parseInt(matches[5], 10);
      var second = parseInt(matches[6], 10);
      var ms = matches[7];
      ms = ms ? 1e3 * parseFloat(ms) : 0;
      var date;
      var offset = timeZoneOffset(isoDate);
      if (offset != null) {
        date = new Date(Date.UTC(year, month, day, hour, minute, second, ms));
        if (is0To99(year)) {
          date.setUTCFullYear(year);
        }
        if (offset !== 0) {
          date.setTime(date.getTime() - offset);
        }
      } else {
        date = new Date(year, month, day, hour, minute, second, ms);
        if (is0To99(year)) {
          date.setFullYear(year);
        }
      }
      return date;
    };
    function getDate(isoDate) {
      var matches = DATE.exec(isoDate);
      if (!matches) {
        return;
      }
      var year = parseInt(matches[1], 10);
      var isBC = !!matches[4];
      if (isBC) {
        year = bcYearToNegativeYear(year);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day = matches[3];
      var date = new Date(year, month, day);
      if (is0To99(year)) {
        date.setFullYear(year);
      }
      return date;
    }
    function timeZoneOffset(isoDate) {
      if (isoDate.endsWith("+00")) {
        return 0;
      }
      var zone = TIME_ZONE.exec(isoDate.split(" ")[1]);
      if (!zone) return;
      var type = zone[1];
      if (type === "Z") {
        return 0;
      }
      var sign = type === "-" ? -1 : 1;
      var offset = parseInt(zone[2], 10) * 3600 + parseInt(zone[3] || 0, 10) * 60 + parseInt(zone[4] || 0, 10);
      return offset * sign * 1e3;
    }
    function bcYearToNegativeYear(year) {
      return -(year - 1);
    }
    function is0To99(num) {
      return num >= 0 && num < 100;
    }
  }
});

// ../../../node_modules/xtend/mutable.js
var require_mutable = __commonJS({
  "../../../node_modules/xtend/mutable.js"(exports2, module2) {
    module2.exports = extend;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function extend(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    }
  }
});

// ../../../node_modules/postgres-interval/index.js
var require_postgres_interval = __commonJS({
  "../../../node_modules/postgres-interval/index.js"(exports2, module2) {
    "use strict";
    var extend = require_mutable();
    module2.exports = PostgresInterval;
    function PostgresInterval(raw) {
      if (!(this instanceof PostgresInterval)) {
        return new PostgresInterval(raw);
      }
      extend(this, parse2(raw));
    }
    var properties = ["seconds", "minutes", "hours", "days", "months", "years"];
    PostgresInterval.prototype.toPostgres = function() {
      var filtered = properties.filter(this.hasOwnProperty, this);
      if (this.milliseconds && filtered.indexOf("seconds") < 0) {
        filtered.push("seconds");
      }
      if (filtered.length === 0) return "0";
      return filtered.map(function(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/\.?0+$/, "");
        }
        return value + " " + property;
      }, this).join(" ");
    };
    var propertiesISOEquivalent = {
      years: "Y",
      months: "M",
      days: "D",
      hours: "H",
      minutes: "M",
      seconds: "S"
    };
    var dateProperties = ["years", "months", "days"];
    var timeProperties = ["hours", "minutes", "seconds"];
    PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function() {
      var datePart = dateProperties.map(buildProperty, this).join("");
      var timePart = timeProperties.map(buildProperty, this).join("");
      return "P" + datePart + "T" + timePart;
      function buildProperty(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/0+$/, "");
        }
        return value + propertiesISOEquivalent[property];
      }
    };
    var NUMBER = "([+-]?\\d+)";
    var YEAR = NUMBER + "\\s+years?";
    var MONTH = NUMBER + "\\s+mons?";
    var DAY = NUMBER + "\\s+days?";
    var TIME = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?";
    var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function(regexString) {
      return "(" + regexString + ")?";
    }).join("\\s*"));
    var positions = {
      years: 2,
      months: 4,
      days: 6,
      hours: 9,
      minutes: 10,
      seconds: 11,
      milliseconds: 12
    };
    var negatives = ["hours", "minutes", "seconds", "milliseconds"];
    function parseMilliseconds(fraction) {
      var microseconds = fraction + "000000".slice(fraction.length);
      return parseInt(microseconds, 10) / 1e3;
    }
    function parse2(interval) {
      if (!interval) return {};
      var matches = INTERVAL.exec(interval);
      var isNegative = matches[8] === "-";
      return Object.keys(positions).reduce(function(parsed, property) {
        var position = positions[property];
        var value = matches[position];
        if (!value) return parsed;
        value = property === "milliseconds" ? parseMilliseconds(value) : parseInt(value, 10);
        if (!value) return parsed;
        if (isNegative && ~negatives.indexOf(property)) {
          value *= -1;
        }
        parsed[property] = value;
        return parsed;
      }, {});
    }
  }
});

// ../../../node_modules/postgres-bytea/index.js
var require_postgres_bytea = __commonJS({
  "../../../node_modules/postgres-bytea/index.js"(exports2, module2) {
    "use strict";
    var bufferFrom = Buffer.from || Buffer;
    module2.exports = function parseBytea(input) {
      if (/^\\x/.test(input)) {
        return bufferFrom(input.substr(2), "hex");
      }
      var output = "";
      var i = 0;
      while (i < input.length) {
        if (input[i] !== "\\") {
          output += input[i];
          ++i;
        } else {
          if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
            output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8));
            i += 4;
          } else {
            var backslashes = 1;
            while (i + backslashes < input.length && input[i + backslashes] === "\\") {
              backslashes++;
            }
            for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
              output += "\\";
            }
            i += Math.floor(backslashes / 2) * 2;
          }
        }
      }
      return bufferFrom(output, "binary");
    };
  }
});

// ../../../node_modules/pg-types/lib/textParsers.js
var require_textParsers = __commonJS({
  "../../../node_modules/pg-types/lib/textParsers.js"(exports2, module2) {
    var array = require_postgres_array();
    var arrayParser = require_arrayParser();
    var parseDate = require_postgres_date();
    var parseInterval = require_postgres_interval();
    var parseByteA = require_postgres_bytea();
    function allowNull(fn) {
      return function nullAllowed(value) {
        if (value === null) return value;
        return fn(value);
      };
    }
    function parseBool(value) {
      if (value === null) return value;
      return value === "TRUE" || value === "t" || value === "true" || value === "y" || value === "yes" || value === "on" || value === "1";
    }
    function parseBoolArray(value) {
      if (!value) return null;
      return array.parse(value, parseBool);
    }
    function parseBaseTenInt(string) {
      return parseInt(string, 10);
    }
    function parseIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(parseBaseTenInt));
    }
    function parseBigIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(function(entry) {
        return parseBigInteger(entry).trim();
      }));
    }
    var parsePointArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parsePoint(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseFloatArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseFloat(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseStringArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value);
      return p.parse();
    };
    var parseDateArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseDate(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseIntervalArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseInterval(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseByteAArray = function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(parseByteA));
    };
    var parseInteger = function(value) {
      return parseInt(value, 10);
    };
    var parseBigInteger = function(value) {
      var valStr = String(value);
      if (/^\d+$/.test(valStr)) {
        return valStr;
      }
      return value;
    };
    var parseJsonArray = function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(JSON.parse));
    };
    var parsePoint = function(value) {
      if (value[0] !== "(") {
        return null;
      }
      value = value.substring(1, value.length - 1).split(",");
      return {
        x: parseFloat(value[0]),
        y: parseFloat(value[1])
      };
    };
    var parseCircle = function(value) {
      if (value[0] !== "<" && value[1] !== "(") {
        return null;
      }
      var point = "(";
      var radius = "";
      var pointParsed = false;
      for (var i = 2; i < value.length - 1; i++) {
        if (!pointParsed) {
          point += value[i];
        }
        if (value[i] === ")") {
          pointParsed = true;
          continue;
        } else if (!pointParsed) {
          continue;
        }
        if (value[i] === ",") {
          continue;
        }
        radius += value[i];
      }
      var result = parsePoint(point);
      result.radius = parseFloat(radius);
      return result;
    };
    var init = function(register) {
      register(20, parseBigInteger);
      register(21, parseInteger);
      register(23, parseInteger);
      register(26, parseInteger);
      register(700, parseFloat);
      register(701, parseFloat);
      register(16, parseBool);
      register(1082, parseDate);
      register(1114, parseDate);
      register(1184, parseDate);
      register(600, parsePoint);
      register(651, parseStringArray);
      register(718, parseCircle);
      register(1e3, parseBoolArray);
      register(1001, parseByteAArray);
      register(1005, parseIntegerArray);
      register(1007, parseIntegerArray);
      register(1028, parseIntegerArray);
      register(1016, parseBigIntegerArray);
      register(1017, parsePointArray);
      register(1021, parseFloatArray);
      register(1022, parseFloatArray);
      register(1231, parseFloatArray);
      register(1014, parseStringArray);
      register(1015, parseStringArray);
      register(1008, parseStringArray);
      register(1009, parseStringArray);
      register(1040, parseStringArray);
      register(1041, parseStringArray);
      register(1115, parseDateArray);
      register(1182, parseDateArray);
      register(1185, parseDateArray);
      register(1186, parseInterval);
      register(1187, parseIntervalArray);
      register(17, parseByteA);
      register(114, JSON.parse.bind(JSON));
      register(3802, JSON.parse.bind(JSON));
      register(199, parseJsonArray);
      register(3807, parseJsonArray);
      register(3907, parseStringArray);
      register(2951, parseStringArray);
      register(791, parseStringArray);
      register(1183, parseStringArray);
      register(1270, parseStringArray);
    };
    module2.exports = {
      init
    };
  }
});

// ../../../node_modules/pg-int8/index.js
var require_pg_int8 = __commonJS({
  "../../../node_modules/pg-int8/index.js"(exports2, module2) {
    "use strict";
    var BASE = 1e6;
    function readInt8(buffer) {
      var high = buffer.readInt32BE(0);
      var low = buffer.readUInt32BE(4);
      var sign = "";
      if (high < 0) {
        high = ~high + (low === 0);
        low = ~low + 1 >>> 0;
        sign = "-";
      }
      var result = "";
      var carry;
      var t;
      var digits;
      var pad;
      var l;
      var i;
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign + digits + result;
        }
        pad = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad += "0";
        }
        result = pad + digits + result;
      }
      {
        carry = high % BASE;
        t = 4294967296 * carry + low;
        digits = "" + t % BASE;
        return sign + digits + result;
      }
    }
    module2.exports = readInt8;
  }
});

// ../../../node_modules/pg-types/lib/binaryParsers.js
var require_binaryParsers = __commonJS({
  "../../../node_modules/pg-types/lib/binaryParsers.js"(exports2, module2) {
    var parseInt64 = require_pg_int8();
    var parseBits = function(data, bits, offset, invert, callback) {
      offset = offset || 0;
      invert = invert || false;
      callback = callback || function(lastValue, newValue, bits2) {
        return lastValue * Math.pow(2, bits2) + newValue;
      };
      var offsetBytes = offset >> 3;
      var inv = function(value) {
        if (invert) {
          return ~value & 255;
        }
        return value;
      };
      var mask = 255;
      var firstBits = 8 - offset % 8;
      if (bits < firstBits) {
        mask = 255 << 8 - bits & 255;
        firstBits = bits;
      }
      if (offset) {
        mask = mask >> offset % 8;
      }
      var result = 0;
      if (offset % 8 + bits >= 8) {
        result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
      }
      var bytes = bits + offset >> 3;
      for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, inv(data[i]), 8);
      }
      var lastBits = (bits + offset) % 8;
      if (lastBits > 0) {
        result = callback(result, inv(data[bytes]) >> 8 - lastBits, lastBits);
      }
      return result;
    };
    var parseFloatFromBits = function(data, precisionBits, exponentBits) {
      var bias = Math.pow(2, exponentBits - 1) - 1;
      var sign = parseBits(data, 1);
      var exponent = parseBits(data, exponentBits, 1);
      if (exponent === 0) {
        return 0;
      }
      var precisionBitsCounter = 1;
      var parsePrecisionBits = function(lastValue, newValue, bits) {
        if (lastValue === 0) {
          lastValue = 1;
        }
        for (var i = 1; i <= bits; i++) {
          precisionBitsCounter /= 2;
          if ((newValue & 1 << bits - i) > 0) {
            lastValue += precisionBitsCounter;
          }
        }
        return lastValue;
      };
      var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);
      if (exponent == Math.pow(2, exponentBits + 1) - 1) {
        if (mantissa === 0) {
          return sign === 0 ? Infinity : -Infinity;
        }
        return NaN;
      }
      return (sign === 0 ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
    };
    var parseInt16 = function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 15, 1, true) + 1);
      }
      return parseBits(value, 15, 1);
    };
    var parseInt32 = function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 31, 1, true) + 1);
      }
      return parseBits(value, 31, 1);
    };
    var parseFloat32 = function(value) {
      return parseFloatFromBits(value, 23, 8);
    };
    var parseFloat64 = function(value) {
      return parseFloatFromBits(value, 52, 11);
    };
    var parseNumeric = function(value) {
      var sign = parseBits(value, 16, 32);
      if (sign == 49152) {
        return NaN;
      }
      var weight = Math.pow(1e4, parseBits(value, 16, 16));
      var result = 0;
      var digits = [];
      var ndigits = parseBits(value, 16);
      for (var i = 0; i < ndigits; i++) {
        result += parseBits(value, 16, 64 + 16 * i) * weight;
        weight /= 1e4;
      }
      var scale = Math.pow(10, parseBits(value, 16, 48));
      return (sign === 0 ? 1 : -1) * Math.round(result * scale) / scale;
    };
    var parseDate = function(isUTC, value) {
      var sign = parseBits(value, 1);
      var rawValue = parseBits(value, 63, 1);
      var result = new Date((sign === 0 ? 1 : -1) * rawValue / 1e3 + 9466848e5);
      if (!isUTC) {
        result.setTime(result.getTime() + result.getTimezoneOffset() * 6e4);
      }
      result.usec = rawValue % 1e3;
      result.getMicroSeconds = function() {
        return this.usec;
      };
      result.setMicroSeconds = function(value2) {
        this.usec = value2;
      };
      result.getUTCMicroSeconds = function() {
        return this.usec;
      };
      return result;
    };
    var parseArray = function(value) {
      var dim = parseBits(value, 32);
      var flags = parseBits(value, 32, 32);
      var elementType = parseBits(value, 32, 64);
      var offset = 96;
      var dims = [];
      for (var i = 0; i < dim; i++) {
        dims[i] = parseBits(value, 32, offset);
        offset += 32;
        offset += 32;
      }
      var parseElement = function(elementType2) {
        var length = parseBits(value, 32, offset);
        offset += 32;
        if (length == 4294967295) {
          return null;
        }
        var result;
        if (elementType2 == 23 || elementType2 == 20) {
          result = parseBits(value, length * 8, offset);
          offset += length * 8;
          return result;
        } else if (elementType2 == 25) {
          result = value.toString(this.encoding, offset >> 3, (offset += length << 3) >> 3);
          return result;
        } else {
          console.log("ERROR: ElementType not implemented: " + elementType2);
        }
      };
      var parse2 = function(dimension, elementType2) {
        var array = [];
        var i2;
        if (dimension.length > 1) {
          var count = dimension.shift();
          for (i2 = 0; i2 < count; i2++) {
            array[i2] = parse2(dimension, elementType2);
          }
          dimension.unshift(count);
        } else {
          for (i2 = 0; i2 < dimension[0]; i2++) {
            array[i2] = parseElement(elementType2);
          }
        }
        return array;
      };
      return parse2(dims, elementType);
    };
    var parseText = function(value) {
      return value.toString("utf8");
    };
    var parseBool = function(value) {
      if (value === null) return null;
      return parseBits(value, 8) > 0;
    };
    var init = function(register) {
      register(20, parseInt64);
      register(21, parseInt16);
      register(23, parseInt32);
      register(26, parseInt32);
      register(1700, parseNumeric);
      register(700, parseFloat32);
      register(701, parseFloat64);
      register(16, parseBool);
      register(1114, parseDate.bind(null, false));
      register(1184, parseDate.bind(null, true));
      register(1e3, parseArray);
      register(1007, parseArray);
      register(1016, parseArray);
      register(1008, parseArray);
      register(1009, parseArray);
      register(25, parseText);
    };
    module2.exports = {
      init
    };
  }
});

// ../../../node_modules/pg-types/lib/builtins.js
var require_builtins = __commonJS({
  "../../../node_modules/pg-types/lib/builtins.js"(exports2, module2) {
    module2.exports = {
      BOOL: 16,
      BYTEA: 17,
      CHAR: 18,
      INT8: 20,
      INT2: 21,
      INT4: 23,
      REGPROC: 24,
      TEXT: 25,
      OID: 26,
      TID: 27,
      XID: 28,
      CID: 29,
      JSON: 114,
      XML: 142,
      PG_NODE_TREE: 194,
      SMGR: 210,
      PATH: 602,
      POLYGON: 604,
      CIDR: 650,
      FLOAT4: 700,
      FLOAT8: 701,
      ABSTIME: 702,
      RELTIME: 703,
      TINTERVAL: 704,
      CIRCLE: 718,
      MACADDR8: 774,
      MONEY: 790,
      MACADDR: 829,
      INET: 869,
      ACLITEM: 1033,
      BPCHAR: 1042,
      VARCHAR: 1043,
      DATE: 1082,
      TIME: 1083,
      TIMESTAMP: 1114,
      TIMESTAMPTZ: 1184,
      INTERVAL: 1186,
      TIMETZ: 1266,
      BIT: 1560,
      VARBIT: 1562,
      NUMERIC: 1700,
      REFCURSOR: 1790,
      REGPROCEDURE: 2202,
      REGOPER: 2203,
      REGOPERATOR: 2204,
      REGCLASS: 2205,
      REGTYPE: 2206,
      UUID: 2950,
      TXID_SNAPSHOT: 2970,
      PG_LSN: 3220,
      PG_NDISTINCT: 3361,
      PG_DEPENDENCIES: 3402,
      TSVECTOR: 3614,
      TSQUERY: 3615,
      GTSVECTOR: 3642,
      REGCONFIG: 3734,
      REGDICTIONARY: 3769,
      JSONB: 3802,
      REGNAMESPACE: 4089,
      REGROLE: 4096
    };
  }
});

// ../../../node_modules/pg-types/index.js
var require_pg_types = __commonJS({
  "../../../node_modules/pg-types/index.js"(exports2) {
    var textParsers = require_textParsers();
    var binaryParsers = require_binaryParsers();
    var arrayParser = require_arrayParser();
    var builtinTypes = require_builtins();
    exports2.getTypeParser = getTypeParser;
    exports2.setTypeParser = setTypeParser;
    exports2.arrayParser = arrayParser;
    exports2.builtins = builtinTypes;
    var typeParsers = {
      text: {},
      binary: {}
    };
    function noParse(val) {
      return String(val);
    }
    function getTypeParser(oid, format) {
      format = format || "text";
      if (!typeParsers[format]) {
        return noParse;
      }
      return typeParsers[format][oid] || noParse;
    }
    function setTypeParser(oid, format, parseFn) {
      if (typeof format == "function") {
        parseFn = format;
        format = "text";
      }
      typeParsers[format][oid] = parseFn;
    }
    textParsers.init(function(oid, converter) {
      typeParsers.text[oid] = converter;
    });
    binaryParsers.init(function(oid, converter) {
      typeParsers.binary[oid] = converter;
    });
  }
});

// ../../../node_modules/pg/lib/defaults.js
var require_defaults = __commonJS({
  "../../../node_modules/pg/lib/defaults.js"(exports2, module2) {
    "use strict";
    var user;
    try {
      user = process.platform === "win32" ? process.env.USERNAME : process.env.USER;
    } catch {
    }
    module2.exports = {
      // database host. defaults to localhost
      host: "localhost",
      // database user's name
      user,
      // name of database to connect
      database: void 0,
      // database user's password
      password: null,
      // a Postgres connection string to be used instead of setting individual connection items
      // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
      // in the defaults object.
      connectionString: void 0,
      // database port
      port: 5432,
      // number of rows to return at a time from a prepared statement's
      // portal. 0 will return all rows at once
      rows: 0,
      // binary result mode
      binary: false,
      // Connection pool options - see https://github.com/brianc/node-pg-pool
      // number of connections to use in connection pool
      // 0 will disable connection pooling
      max: 10,
      // max milliseconds a client can go unused before it is removed
      // from the pool and destroyed
      idleTimeoutMillis: 3e4,
      client_encoding: "",
      ssl: false,
      application_name: void 0,
      fallback_application_name: void 0,
      options: void 0,
      parseInputDatesAsUTC: false,
      // max milliseconds any query using this connection will execute for before timing out in error.
      // false=unlimited
      statement_timeout: false,
      // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
      // false=unlimited
      lock_timeout: false,
      // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
      // false=unlimited
      idle_in_transaction_session_timeout: false,
      // max milliseconds to wait for query to complete (client side)
      query_timeout: false,
      connect_timeout: 0,
      keepalives: 1,
      keepalives_idle: 0
    };
    var pgTypes = require_pg_types();
    var parseBigInteger = pgTypes.getTypeParser(20, "text");
    var parseBigIntegerArray = pgTypes.getTypeParser(1016, "text");
    module2.exports.__defineSetter__("parseInt8", function(val) {
      pgTypes.setTypeParser(20, "text", val ? pgTypes.getTypeParser(23, "text") : parseBigInteger);
      pgTypes.setTypeParser(1016, "text", val ? pgTypes.getTypeParser(1007, "text") : parseBigIntegerArray);
    });
  }
});

// ../../../node_modules/pg/lib/utils.js
var require_utils2 = __commonJS({
  "../../../node_modules/pg/lib/utils.js"(exports2, module2) {
    "use strict";
    var defaults2 = require_defaults();
    var util = require("util");
    var { isDate } = util.types || util;
    function escapeElement(elementRepresentation) {
      const escaped = elementRepresentation.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return '"' + escaped + '"';
    }
    function arrayString(val) {
      let result = "{";
      for (let i = 0; i < val.length; i++) {
        if (i > 0) {
          result = result + ",";
        }
        if (val[i] === null || typeof val[i] === "undefined") {
          result = result + "NULL";
        } else if (Array.isArray(val[i])) {
          result = result + arrayString(val[i]);
        } else if (ArrayBuffer.isView(val[i])) {
          let item = val[i];
          if (!(item instanceof Buffer)) {
            const buf = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
            if (buf.length === item.byteLength) {
              item = buf;
            } else {
              item = buf.slice(item.byteOffset, item.byteOffset + item.byteLength);
            }
          }
          result += "\\\\x" + item.toString("hex");
        } else {
          result += escapeElement(prepareValue(val[i]));
        }
      }
      result = result + "}";
      return result;
    }
    var prepareValue = function(val, seen) {
      if (val == null) {
        return null;
      }
      if (typeof val === "object") {
        if (val instanceof Buffer) {
          return val;
        }
        if (ArrayBuffer.isView(val)) {
          const buf = Buffer.from(val.buffer, val.byteOffset, val.byteLength);
          if (buf.length === val.byteLength) {
            return buf;
          }
          return buf.slice(val.byteOffset, val.byteOffset + val.byteLength);
        }
        if (isDate(val)) {
          if (defaults2.parseInputDatesAsUTC) {
            return dateToStringUTC(val);
          } else {
            return dateToString(val);
          }
        }
        if (Array.isArray(val)) {
          return arrayString(val);
        }
        return prepareObject(val, seen);
      }
      return val.toString();
    };
    function prepareObject(val, seen) {
      if (val && typeof val.toPostgres === "function") {
        seen = seen || [];
        if (seen.indexOf(val) !== -1) {
          throw new Error('circular reference detected while preparing "' + val + '" for query');
        }
        seen.push(val);
        return prepareValue(val.toPostgres(prepareValue), seen);
      }
      return JSON.stringify(val);
    }
    function dateToString(date) {
      let offset = -date.getTimezoneOffset();
      let year = date.getFullYear();
      const isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      let ret = String(year).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + ":" + String(date.getSeconds()).padStart(2, "0") + "." + String(date.getMilliseconds()).padStart(3, "0");
      if (offset < 0) {
        ret += "-";
        offset *= -1;
      } else {
        ret += "+";
      }
      ret += String(Math.floor(offset / 60)).padStart(2, "0") + ":" + String(offset % 60).padStart(2, "0");
      if (isBCYear) ret += " BC";
      return ret;
    }
    function dateToStringUTC(date) {
      let year = date.getUTCFullYear();
      const isBCYear = year < 1;
      if (isBCYear) year = Math.abs(year) + 1;
      let ret = String(year).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0") + "T" + String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0") + ":" + String(date.getUTCSeconds()).padStart(2, "0") + "." + String(date.getUTCMilliseconds()).padStart(3, "0");
      ret += "+00:00";
      if (isBCYear) ret += " BC";
      return ret;
    }
    function normalizeQueryConfig(config, values, callback) {
      config = typeof config === "string" ? { text: config } : config;
      if (values) {
        if (typeof values === "function") {
          config.callback = values;
        } else {
          config.values = values;
        }
      }
      if (callback) {
        config.callback = callback;
      }
      return config;
    }
    var escapeIdentifier2 = function(str) {
      return '"' + str.replace(/"/g, '""') + '"';
    };
    var escapeLiteral2 = function(str) {
      let hasBackslash = false;
      let escaped = "'";
      if (str == null) {
        return "''";
      }
      if (typeof str !== "string") {
        return "''";
      }
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === "'") {
          escaped += c + c;
        } else if (c === "\\") {
          escaped += c + c;
          hasBackslash = true;
        } else {
          escaped += c;
        }
      }
      escaped += "'";
      if (hasBackslash === true) {
        escaped = " E" + escaped;
      }
      return escaped;
    };
    module2.exports = {
      prepareValue: function prepareValueWrapper(value) {
        return prepareValue(value);
      },
      normalizeQueryConfig,
      escapeIdentifier: escapeIdentifier2,
      escapeLiteral: escapeLiteral2
    };
  }
});

// ../../../node_modules/pg/lib/crypto/utils-legacy.js
var require_utils_legacy = __commonJS({
  "../../../node_modules/pg/lib/crypto/utils-legacy.js"(exports2, module2) {
    "use strict";
    var nodeCrypto = require("crypto");
    function md5(string) {
      return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
    }
    function postgresMd5PasswordHash(user, password, salt) {
      const inner = md5(password + user);
      const outer = md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    function sha256(text) {
      return nodeCrypto.createHash("sha256").update(text).digest();
    }
    function hashByName(hashName, text) {
      hashName = hashName.replace(/(\D)-/, "$1");
      return nodeCrypto.createHash(hashName).update(text).digest();
    }
    function hmacSha256(key, msg) {
      return nodeCrypto.createHmac("sha256", key).update(msg).digest();
    }
    async function deriveKey(password, salt, iterations) {
      return nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
    }
    module2.exports = {
      postgresMd5PasswordHash,
      randomBytes: nodeCrypto.randomBytes,
      deriveKey,
      sha256,
      hashByName,
      hmacSha256,
      md5
    };
  }
});

// ../../../node_modules/pg/lib/crypto/utils-webcrypto.js
var require_utils_webcrypto = __commonJS({
  "../../../node_modules/pg/lib/crypto/utils-webcrypto.js"(exports2, module2) {
    var nodeCrypto = require("crypto");
    module2.exports = {
      postgresMd5PasswordHash,
      randomBytes,
      deriveKey,
      sha256,
      hashByName,
      hmacSha256,
      md5
    };
    var webCrypto = nodeCrypto.webcrypto || globalThis.crypto;
    var subtleCrypto = webCrypto.subtle;
    var textEncoder = new TextEncoder();
    function randomBytes(length) {
      return webCrypto.getRandomValues(Buffer.alloc(length));
    }
    async function md5(string) {
      try {
        return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
      } catch (e) {
        const data = typeof string === "string" ? textEncoder.encode(string) : string;
        const hash = await subtleCrypto.digest("MD5", data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    }
    async function postgresMd5PasswordHash(user, password, salt) {
      const inner = await md5(password + user);
      const outer = await md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    async function sha256(text) {
      return await subtleCrypto.digest("SHA-256", text);
    }
    async function hashByName(hashName, text) {
      return await subtleCrypto.digest(hashName, text);
    }
    async function hmacSha256(keyBuffer, msg) {
      const key = await subtleCrypto.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return await subtleCrypto.sign("HMAC", key, textEncoder.encode(msg));
    }
    async function deriveKey(password, salt, iterations) {
      const key = await subtleCrypto.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations };
      return await subtleCrypto.deriveBits(params, key, 32 * 8, ["deriveBits"]);
    }
  }
});

// ../../../node_modules/pg/lib/crypto/utils.js
var require_utils3 = __commonJS({
  "../../../node_modules/pg/lib/crypto/utils.js"(exports2, module2) {
    "use strict";
    var useLegacyCrypto = parseInt(process.versions && process.versions.node && process.versions.node.split(".")[0]) < 15;
    if (useLegacyCrypto) {
      module2.exports = require_utils_legacy();
    } else {
      module2.exports = require_utils_webcrypto();
    }
  }
});

// ../../../node_modules/pg/lib/crypto/cert-signatures.js
var require_cert_signatures = __commonJS({
  "../../../node_modules/pg/lib/crypto/cert-signatures.js"(exports2, module2) {
    function x509Error(msg, cert) {
      return new Error("SASL channel binding: " + msg + " when parsing public certificate " + cert.toString("base64"));
    }
    function readASN1Length(data, index) {
      let length = data[index++];
      if (length < 128) return { length, index };
      const lengthBytes = length & 127;
      if (lengthBytes > 4) throw x509Error("bad length", data);
      length = 0;
      for (let i = 0; i < lengthBytes; i++) {
        length = length << 8 | data[index++];
      }
      return { length, index };
    }
    function readASN1OID(data, index) {
      if (data[index++] !== 6) throw x509Error("non-OID data", data);
      const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index);
      index = indexAfterOIDLength;
      const lastIndex = index + OIDLength;
      const byte1 = data[index++];
      let oid = (byte1 / 40 >> 0) + "." + byte1 % 40;
      while (index < lastIndex) {
        let value = 0;
        while (index < lastIndex) {
          const nextByte = data[index++];
          value = value << 7 | nextByte & 127;
          if (nextByte < 128) break;
        }
        oid += "." + value;
      }
      return { oid, index };
    }
    function expectASN1Seq(data, index) {
      if (data[index++] !== 48) throw x509Error("non-sequence data", data);
      return readASN1Length(data, index);
    }
    function signatureAlgorithmHashFromCertificate(data, index) {
      if (index === void 0) index = 0;
      index = expectASN1Seq(data, index).index;
      const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index);
      index = indexAfterCertInfoLength + certInfoLength;
      index = expectASN1Seq(data, index).index;
      const { oid, index: indexAfterOID } = readASN1OID(data, index);
      switch (oid) {
        // RSA
        case "1.2.840.113549.1.1.4":
          return "MD5";
        case "1.2.840.113549.1.1.5":
          return "SHA-1";
        case "1.2.840.113549.1.1.11":
          return "SHA-256";
        case "1.2.840.113549.1.1.12":
          return "SHA-384";
        case "1.2.840.113549.1.1.13":
          return "SHA-512";
        case "1.2.840.113549.1.1.14":
          return "SHA-224";
        case "1.2.840.113549.1.1.15":
          return "SHA512-224";
        case "1.2.840.113549.1.1.16":
          return "SHA512-256";
        // ECDSA
        case "1.2.840.10045.4.1":
          return "SHA-1";
        case "1.2.840.10045.4.3.1":
          return "SHA-224";
        case "1.2.840.10045.4.3.2":
          return "SHA-256";
        case "1.2.840.10045.4.3.3":
          return "SHA-384";
        case "1.2.840.10045.4.3.4":
          return "SHA-512";
        // RSASSA-PSS: hash is indicated separately
        case "1.2.840.113549.1.1.10": {
          index = indexAfterOID;
          index = expectASN1Seq(data, index).index;
          if (data[index++] !== 160) throw x509Error("non-tag data", data);
          index = readASN1Length(data, index).index;
          index = expectASN1Seq(data, index).index;
          const { oid: hashOID } = readASN1OID(data, index);
          switch (hashOID) {
            // standalone hash OIDs
            case "1.2.840.113549.2.5":
              return "MD5";
            case "1.3.14.3.2.26":
              return "SHA-1";
            case "2.16.840.1.101.3.4.2.1":
              return "SHA-256";
            case "2.16.840.1.101.3.4.2.2":
              return "SHA-384";
            case "2.16.840.1.101.3.4.2.3":
              return "SHA-512";
          }
          throw x509Error("unknown hash OID " + hashOID, data);
        }
        // Ed25519 -- see https: return//github.com/openssl/openssl/issues/15477
        case "1.3.101.110":
        case "1.3.101.112":
          return "SHA-512";
        // Ed448 -- still not in pg 17.2 (if supported, digest would be SHAKE256 x 64 bytes)
        case "1.3.101.111":
        case "1.3.101.113":
          throw x509Error("Ed448 certificate channel binding is not currently supported by Postgres");
      }
      throw x509Error("unknown OID " + oid, data);
    }
    module2.exports = { signatureAlgorithmHashFromCertificate };
  }
});

// ../../../node_modules/pg/lib/crypto/sasl.js
var require_sasl = __commonJS({
  "../../../node_modules/pg/lib/crypto/sasl.js"(exports2, module2) {
    "use strict";
    var crypto = require_utils3();
    var { signatureAlgorithmHashFromCertificate } = require_cert_signatures();
    function startSession(mechanisms, stream) {
      const candidates = ["SCRAM-SHA-256"];
      if (stream) candidates.unshift("SCRAM-SHA-256-PLUS");
      const mechanism = candidates.find((candidate) => mechanisms.includes(candidate));
      if (!mechanism) {
        throw new Error("SASL: Only mechanism(s) " + candidates.join(" and ") + " are supported");
      }
      if (mechanism === "SCRAM-SHA-256-PLUS" && typeof stream.getPeerCertificate !== "function") {
        throw new Error("SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate");
      }
      const clientNonce = crypto.randomBytes(18).toString("base64");
      const gs2Header = mechanism === "SCRAM-SHA-256-PLUS" ? "p=tls-server-end-point" : stream ? "y" : "n";
      return {
        mechanism,
        clientNonce,
        response: gs2Header + ",,n=*,r=" + clientNonce,
        message: "SASLInitialResponse"
      };
    }
    async function continueSession(session2, password, serverData, stream) {
      if (session2.message !== "SASLInitialResponse") {
        throw new Error("SASL: Last message was not SASLInitialResponse");
      }
      if (typeof password !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
      }
      if (password === "") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
      }
      const sv = parseServerFirstMessage(serverData);
      if (!sv.nonce.startsWith(session2.clientNonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
      } else if (sv.nonce.length === session2.clientNonce.length) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
      }
      const clientFirstMessageBare = "n=*,r=" + session2.clientNonce;
      const serverFirstMessage = "r=" + sv.nonce + ",s=" + sv.salt + ",i=" + sv.iteration;
      let channelBinding = stream ? "eSws" : "biws";
      if (session2.mechanism === "SCRAM-SHA-256-PLUS") {
        const peerCert = stream.getPeerCertificate().raw;
        let hashName = signatureAlgorithmHashFromCertificate(peerCert);
        if (hashName === "MD5" || hashName === "SHA-1") hashName = "SHA-256";
        const certHash = await crypto.hashByName(hashName, peerCert);
        const bindingData = Buffer.concat([Buffer.from("p=tls-server-end-point,,"), Buffer.from(certHash)]);
        channelBinding = bindingData.toString("base64");
      }
      const clientFinalMessageWithoutProof = "c=" + channelBinding + ",r=" + sv.nonce;
      const authMessage = clientFirstMessageBare + "," + serverFirstMessage + "," + clientFinalMessageWithoutProof;
      const saltBytes = Buffer.from(sv.salt, "base64");
      const saltedPassword = await crypto.deriveKey(password, saltBytes, sv.iteration);
      const clientKey = await crypto.hmacSha256(saltedPassword, "Client Key");
      const storedKey = await crypto.sha256(clientKey);
      const clientSignature = await crypto.hmacSha256(storedKey, authMessage);
      const clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString("base64");
      const serverKey = await crypto.hmacSha256(saltedPassword, "Server Key");
      const serverSignatureBytes = await crypto.hmacSha256(serverKey, authMessage);
      session2.message = "SASLResponse";
      session2.serverSignature = Buffer.from(serverSignatureBytes).toString("base64");
      session2.response = clientFinalMessageWithoutProof + ",p=" + clientProof;
    }
    function finalizeSession(session2, serverData) {
      if (session2.message !== "SASLResponse") {
        throw new Error("SASL: Last message was not SASLResponse");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
      }
      const { serverSignature } = parseServerFinalMessage(serverData);
      if (serverSignature !== session2.serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
      }
    }
    function isPrintableChars(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: text must be a string");
      }
      return text.split("").map((_, i) => text.charCodeAt(i)).every((c) => c >= 33 && c <= 43 || c >= 45 && c <= 126);
    }
    function isBase64(text) {
      return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text);
    }
    function parseAttributePairs(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: attribute pairs text must be a string");
      }
      return new Map(
        text.split(",").map((attrValue) => {
          if (!/^.=/.test(attrValue)) {
            throw new Error("SASL: Invalid attribute pair entry");
          }
          const name = attrValue[0];
          const value = attrValue.substring(2);
          return [name, value];
        })
      );
    }
    function parseServerFirstMessage(data) {
      const attrPairs = parseAttributePairs(data);
      const nonce = attrPairs.get("r");
      if (!nonce) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
      } else if (!isPrintableChars(nonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
      }
      const salt = attrPairs.get("s");
      if (!salt) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
      } else if (!isBase64(salt)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
      }
      const iterationText = attrPairs.get("i");
      if (!iterationText) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
      } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
      }
      const iteration = parseInt(iterationText, 10);
      return {
        nonce,
        salt,
        iteration
      };
    }
    function parseServerFinalMessage(serverData) {
      const attrPairs = parseAttributePairs(serverData);
      const serverSignature = attrPairs.get("v");
      if (!serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
      } else if (!isBase64(serverSignature)) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
      }
      return {
        serverSignature
      };
    }
    function xorBuffers(a, b) {
      if (!Buffer.isBuffer(a)) {
        throw new TypeError("first argument must be a Buffer");
      }
      if (!Buffer.isBuffer(b)) {
        throw new TypeError("second argument must be a Buffer");
      }
      if (a.length !== b.length) {
        throw new Error("Buffer lengths must match");
      }
      if (a.length === 0) {
        throw new Error("Buffers cannot be empty");
      }
      return Buffer.from(a.map((_, i) => a[i] ^ b[i]));
    }
    module2.exports = {
      startSession,
      continueSession,
      finalizeSession
    };
  }
});

// ../../../node_modules/pg/lib/type-overrides.js
var require_type_overrides = __commonJS({
  "../../../node_modules/pg/lib/type-overrides.js"(exports2, module2) {
    "use strict";
    var types2 = require_pg_types();
    function TypeOverrides2(userTypes) {
      this._types = userTypes || types2;
      this.text = {};
      this.binary = {};
    }
    TypeOverrides2.prototype.getOverrides = function(format) {
      switch (format) {
        case "text":
          return this.text;
        case "binary":
          return this.binary;
        default:
          return {};
      }
    };
    TypeOverrides2.prototype.setTypeParser = function(oid, format, parseFn) {
      if (typeof format === "function") {
        parseFn = format;
        format = "text";
      }
      this.getOverrides(format)[oid] = parseFn;
    };
    TypeOverrides2.prototype.getTypeParser = function(oid, format) {
      format = format || "text";
      return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format);
    };
    module2.exports = TypeOverrides2;
  }
});

// ../../../node_modules/pg-connection-string/index.js
var require_pg_connection_string = __commonJS({
  "../../../node_modules/pg-connection-string/index.js"(exports2, module2) {
    "use strict";
    function parse2(str, options2 = {}) {
      if (str.charAt(0) === "/") {
        const config2 = str.split(" ");
        return { host: config2[0], database: config2[1] };
      }
      const config = {};
      let result;
      let dummyHost = false;
      if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
        str = encodeURI(str).replace(/%25(\d\d)/g, "%$1");
      }
      try {
        try {
          result = new URL(str, "postgres://base");
        } catch (e) {
          result = new URL(str.replace("@/", "@___DUMMY___/"), "postgres://base");
          dummyHost = true;
        }
      } catch (err) {
        err.input && (err.input = "*****REDACTED*****");
        throw err;
      }
      for (const entry of result.searchParams.entries()) {
        config[entry[0]] = entry[1];
      }
      config.user = config.user || decodeURIComponent(result.username);
      config.password = config.password || decodeURIComponent(result.password);
      if (result.protocol == "socket:") {
        config.host = decodeURI(result.pathname);
        config.database = result.searchParams.get("db");
        config.client_encoding = result.searchParams.get("encoding");
        return config;
      }
      const hostname = dummyHost ? "" : result.hostname;
      if (!config.host) {
        config.host = decodeURIComponent(hostname);
      } else if (hostname && /^%2f/i.test(hostname)) {
        result.pathname = hostname + result.pathname;
      }
      if (!config.port) {
        config.port = result.port;
      }
      const pathname = result.pathname.slice(1) || null;
      config.database = pathname ? decodeURI(pathname) : null;
      if (config.ssl === "true" || config.ssl === "1") {
        config.ssl = true;
      }
      if (config.ssl === "0") {
        config.ssl = false;
      }
      if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
        config.ssl = {};
      }
      const fs = config.sslcert || config.sslkey || config.sslrootcert ? require("fs") : null;
      if (config.sslcert) {
        config.ssl.cert = fs.readFileSync(config.sslcert).toString();
      }
      if (config.sslkey) {
        config.ssl.key = fs.readFileSync(config.sslkey).toString();
      }
      if (config.sslrootcert) {
        config.ssl.ca = fs.readFileSync(config.sslrootcert).toString();
      }
      if (options2.useLibpqCompat && config.uselibpqcompat) {
        throw new Error("Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.");
      }
      if (config.uselibpqcompat === "true" || options2.useLibpqCompat) {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
          case "require": {
            if (config.sslrootcert) {
              config.ssl.checkServerIdentity = function() {
              };
            } else {
              config.ssl.rejectUnauthorized = false;
            }
            break;
          }
          case "verify-ca": {
            if (!config.ssl.ca) {
              throw new Error(
                "SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security."
              );
            }
            config.ssl.checkServerIdentity = function() {
            };
            break;
          }
          case "verify-full": {
            break;
          }
        }
      } else {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full": {
            if (config.sslmode !== "verify-full") {
              deprecatedSslModeWarning(config.sslmode);
            }
            break;
          }
          case "no-verify": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
        }
      }
      return config;
    }
    function toConnectionOptions(sslConfig) {
      const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
        if (value !== void 0 && value !== null) {
          c[key] = value;
        }
        return c;
      }, {});
      return connectionOptions;
    }
    function toClientConfig(config) {
      const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
        if (key === "ssl") {
          const sslConfig = value;
          if (typeof sslConfig === "boolean") {
            c[key] = sslConfig;
          }
          if (typeof sslConfig === "object") {
            c[key] = toConnectionOptions(sslConfig);
          }
        } else if (value !== void 0 && value !== null) {
          if (key === "port") {
            if (value !== "") {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                throw new Error(`Invalid ${key}: ${value}`);
              }
              c[key] = v;
            }
          } else {
            c[key] = value;
          }
        }
        return c;
      }, {});
      return poolConfig;
    }
    function parseIntoClientConfig(str) {
      return toClientConfig(parse2(str));
    }
    function deprecatedSslModeWarning(sslmode) {
      if (!deprecatedSslModeWarning.warned && typeof process !== "undefined" && process.emitWarning) {
        deprecatedSslModeWarning.warned = true;
        process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${sslmode}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`);
      }
    }
    module2.exports = parse2;
    parse2.parse = parse2;
    parse2.toClientConfig = toClientConfig;
    parse2.parseIntoClientConfig = parseIntoClientConfig;
  }
});

// ../../../node_modules/pg/lib/connection-parameters.js
var require_connection_parameters = __commonJS({
  "../../../node_modules/pg/lib/connection-parameters.js"(exports2, module2) {
    "use strict";
    var dns = require("dns");
    var defaults2 = require_defaults();
    var parse2 = require_pg_connection_string().parse;
    var val = function(key, config, envVar) {
      if (config[key]) {
        return config[key];
      }
      if (envVar === void 0) {
        envVar = process.env["PG" + key.toUpperCase()];
      } else if (envVar === false) {
      } else {
        envVar = process.env[envVar];
      }
      return envVar || defaults2[key];
    };
    var readSSLConfigFromEnvironment = function() {
      switch (process.env.PGSSLMODE) {
        case "disable":
          return false;
        case "prefer":
        case "require":
        case "verify-ca":
        case "verify-full":
          return true;
        case "no-verify":
          return { rejectUnauthorized: false };
      }
      return defaults2.ssl;
    };
    var quoteParamValue = function(value) {
      return "'" + ("" + value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    };
    var add = function(params, config, paramName) {
      const value = config[paramName];
      if (value !== void 0 && value !== null) {
        params.push(paramName + "=" + quoteParamValue(value));
      }
    };
    var ConnectionParameters = class {
      constructor(config) {
        config = typeof config === "string" ? parse2(config) : config || {};
        if (config.connectionString) {
          config = Object.assign({}, config, parse2(config.connectionString));
        }
        this.user = val("user", config);
        this.database = val("database", config);
        if (this.database === void 0) {
          this.database = this.user;
        }
        this.port = parseInt(val("port", config), 10);
        this.host = val("host", config);
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: val("password", config)
        });
        this.binary = val("binary", config);
        this.options = val("options", config);
        this.ssl = typeof config.ssl === "undefined" ? readSSLConfigFromEnvironment() : config.ssl;
        if (typeof this.ssl === "string") {
          if (this.ssl === "true") {
            this.ssl = true;
          }
        }
        if (this.ssl === "no-verify") {
          this.ssl = { rejectUnauthorized: false };
        }
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this.client_encoding = val("client_encoding", config);
        this.replication = val("replication", config);
        this.isDomainSocket = !(this.host || "").indexOf("/");
        this.application_name = val("application_name", config, "PGAPPNAME");
        this.fallback_application_name = val("fallback_application_name", config, false);
        this.statement_timeout = val("statement_timeout", config, false);
        this.lock_timeout = val("lock_timeout", config, false);
        this.idle_in_transaction_session_timeout = val("idle_in_transaction_session_timeout", config, false);
        this.query_timeout = val("query_timeout", config, false);
        if (config.connectionTimeoutMillis === void 0) {
          this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0;
        } else {
          this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1e3);
        }
        if (config.keepAlive === false) {
          this.keepalives = 0;
        } else if (config.keepAlive === true) {
          this.keepalives = 1;
        }
        if (typeof config.keepAliveInitialDelayMillis === "number") {
          this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1e3);
        }
      }
      getLibpqConnectionString(cb) {
        const params = [];
        add(params, this, "user");
        add(params, this, "password");
        add(params, this, "port");
        add(params, this, "application_name");
        add(params, this, "fallback_application_name");
        add(params, this, "connect_timeout");
        add(params, this, "options");
        const ssl = typeof this.ssl === "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
        add(params, ssl, "sslmode");
        add(params, ssl, "sslca");
        add(params, ssl, "sslkey");
        add(params, ssl, "sslcert");
        add(params, ssl, "sslrootcert");
        if (this.database) {
          params.push("dbname=" + quoteParamValue(this.database));
        }
        if (this.replication) {
          params.push("replication=" + quoteParamValue(this.replication));
        }
        if (this.host) {
          params.push("host=" + quoteParamValue(this.host));
        }
        if (this.isDomainSocket) {
          return cb(null, params.join(" "));
        }
        if (this.client_encoding) {
          params.push("client_encoding=" + quoteParamValue(this.client_encoding));
        }
        dns.lookup(this.host, function(err, address) {
          if (err) return cb(err, null);
          params.push("hostaddr=" + quoteParamValue(address));
          return cb(null, params.join(" "));
        });
      }
    };
    module2.exports = ConnectionParameters;
  }
});

// ../../../node_modules/pg/lib/result.js
var require_result = __commonJS({
  "../../../node_modules/pg/lib/result.js"(exports2, module2) {
    "use strict";
    var types2 = require_pg_types();
    var matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
    var Result2 = class {
      constructor(rowMode, types3) {
        this.command = null;
        this.rowCount = null;
        this.oid = null;
        this.rows = [];
        this.fields = [];
        this._parsers = void 0;
        this._types = types3;
        this.RowCtor = null;
        this.rowAsArray = rowMode === "array";
        if (this.rowAsArray) {
          this.parseRow = this._parseRowAsArray;
        }
        this._prebuiltEmptyResultObject = null;
      }
      // adds a command complete message
      addCommandComplete(msg) {
        let match;
        if (msg.text) {
          match = matchRegexp.exec(msg.text);
        } else {
          match = matchRegexp.exec(msg.command);
        }
        if (match) {
          this.command = match[1];
          if (match[3]) {
            this.oid = parseInt(match[2], 10);
            this.rowCount = parseInt(match[3], 10);
          } else if (match[2]) {
            this.rowCount = parseInt(match[2], 10);
          }
        }
      }
      _parseRowAsArray(rowData) {
        const row = new Array(rowData.length);
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          if (rawValue !== null) {
            row[i] = this._parsers[i](rawValue);
          } else {
            row[i] = null;
          }
        }
        return row;
      }
      parseRow(rowData) {
        const row = { ...this._prebuiltEmptyResultObject };
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          const field = this.fields[i].name;
          if (rawValue !== null) {
            const v = this.fields[i].format === "binary" ? Buffer.from(rawValue) : rawValue;
            row[field] = this._parsers[i](v);
          } else {
            row[field] = null;
          }
        }
        return row;
      }
      addRow(row) {
        this.rows.push(row);
      }
      addFields(fieldDescriptions) {
        this.fields = fieldDescriptions;
        if (this.fields.length) {
          this._parsers = new Array(fieldDescriptions.length);
        }
        const row = {};
        for (let i = 0; i < fieldDescriptions.length; i++) {
          const desc = fieldDescriptions[i];
          row[desc.name] = null;
          if (this._types) {
            this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || "text");
          } else {
            this._parsers[i] = types2.getTypeParser(desc.dataTypeID, desc.format || "text");
          }
        }
        this._prebuiltEmptyResultObject = { ...row };
      }
    };
    module2.exports = Result2;
  }
});

// ../../../node_modules/pg/lib/query.js
var require_query = __commonJS({
  "../../../node_modules/pg/lib/query.js"(exports2, module2) {
    "use strict";
    var { EventEmitter } = require("events");
    var Result2 = require_result();
    var utils = require_utils2();
    var Query2 = class extends EventEmitter {
      constructor(config, values, callback) {
        super();
        config = utils.normalizeQueryConfig(config, values, callback);
        this.text = config.text;
        this.values = config.values;
        this.rows = config.rows;
        this.types = config.types;
        this.name = config.name;
        this.queryMode = config.queryMode;
        this.binary = config.binary;
        this.portal = config.portal || "";
        this.callback = config.callback;
        this._rowMode = config.rowMode;
        if (process.domain && config.callback) {
          this.callback = process.domain.bind(config.callback);
        }
        this._result = new Result2(this._rowMode, this.types);
        this._results = this._result;
        this._canceledDueToError = false;
      }
      requiresPreparation() {
        if (this.queryMode === "extended") {
          return true;
        }
        if (this.name) {
          return true;
        }
        if (this.rows) {
          return true;
        }
        if (!this.text) {
          return false;
        }
        if (!this.values) {
          return false;
        }
        return this.values.length > 0;
      }
      _checkForMultirow() {
        if (this._result.command) {
          if (!Array.isArray(this._results)) {
            this._results = [this._result];
          }
          this._result = new Result2(this._rowMode, this._result._types);
          this._results.push(this._result);
        }
      }
      // associates row metadata from the supplied
      // message with this query object
      // metadata used when parsing row results
      handleRowDescription(msg) {
        this._checkForMultirow();
        this._result.addFields(msg.fields);
        this._accumulateRows = this.callback || !this.listeners("row").length;
      }
      handleDataRow(msg) {
        let row;
        if (this._canceledDueToError) {
          return;
        }
        try {
          row = this._result.parseRow(msg.fields);
        } catch (err) {
          this._canceledDueToError = err;
          return;
        }
        this.emit("row", row, this._result);
        if (this._accumulateRows) {
          this._result.addRow(row);
        }
      }
      handleCommandComplete(msg, connection) {
        this._checkForMultirow();
        this._result.addCommandComplete(msg);
        if (this.rows) {
          connection.sync();
        }
      }
      // if a named prepared statement is created with empty query text
      // the backend will send an emptyQuery message but *not* a command complete message
      // since we pipeline sync immediately after execute we don't need to do anything here
      // unless we have rows specified, in which case we did not pipeline the initial sync call
      handleEmptyQuery(connection) {
        if (this.rows) {
          connection.sync();
        }
      }
      handleError(err, connection) {
        if (this._canceledDueToError) {
          err = this._canceledDueToError;
          this._canceledDueToError = false;
        }
        if (this.callback) {
          return this.callback(err);
        }
        this.emit("error", err);
      }
      handleReadyForQuery(con) {
        if (this._canceledDueToError) {
          return this.handleError(this._canceledDueToError, con);
        }
        if (this.callback) {
          try {
            this.callback(null, this._results);
          } catch (err) {
            process.nextTick(() => {
              throw err;
            });
          }
        }
        this.emit("end", this._results);
      }
      submit(connection) {
        if (typeof this.text !== "string" && typeof this.name !== "string") {
          return new Error("A query must have either text or a name. Supplying neither is unsupported.");
        }
        const previous = connection.parsedStatements[this.name];
        if (this.text && previous && this.text !== previous) {
          return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
        }
        if (this.values && !Array.isArray(this.values)) {
          return new Error("Query values must be an array");
        }
        if (this.requiresPreparation()) {
          connection.stream.cork && connection.stream.cork();
          try {
            this.prepare(connection);
          } finally {
            connection.stream.uncork && connection.stream.uncork();
          }
        } else {
          connection.query(this.text);
        }
        return null;
      }
      hasBeenParsed(connection) {
        return this.name && connection.parsedStatements[this.name];
      }
      handlePortalSuspended(connection) {
        this._getRows(connection, this.rows);
      }
      _getRows(connection, rows) {
        connection.execute({
          portal: this.portal,
          rows
        });
        if (!rows) {
          connection.sync();
        } else {
          connection.flush();
        }
      }
      // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
      prepare(connection) {
        if (!this.hasBeenParsed(connection)) {
          connection.parse({
            text: this.text,
            name: this.name,
            types: this.types
          });
        }
        try {
          connection.bind({
            portal: this.portal,
            statement: this.name,
            values: this.values,
            binary: this.binary,
            valueMapper: utils.prepareValue
          });
        } catch (err) {
          this.handleError(err, connection);
          return;
        }
        connection.describe({
          type: "P",
          name: this.portal || ""
        });
        this._getRows(connection, this.rows);
      }
      handleCopyInResponse(connection) {
        connection.sendCopyFail("No source stream defined");
      }
      handleCopyData(msg, connection) {
      }
    };
    module2.exports = Query2;
  }
});

// ../../../node_modules/pg-protocol/dist/messages.js
var require_messages = __commonJS({
  "../../../node_modules/pg-protocol/dist/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NoticeMessage = exports2.DataRowMessage = exports2.CommandCompleteMessage = exports2.ReadyForQueryMessage = exports2.NotificationResponseMessage = exports2.BackendKeyDataMessage = exports2.AuthenticationMD5Password = exports2.ParameterStatusMessage = exports2.ParameterDescriptionMessage = exports2.RowDescriptionMessage = exports2.Field = exports2.CopyResponse = exports2.CopyDataMessage = exports2.DatabaseError = exports2.copyDone = exports2.emptyQuery = exports2.replicationStart = exports2.portalSuspended = exports2.noData = exports2.closeComplete = exports2.bindComplete = exports2.parseComplete = void 0;
    exports2.parseComplete = {
      name: "parseComplete",
      length: 5
    };
    exports2.bindComplete = {
      name: "bindComplete",
      length: 5
    };
    exports2.closeComplete = {
      name: "closeComplete",
      length: 5
    };
    exports2.noData = {
      name: "noData",
      length: 5
    };
    exports2.portalSuspended = {
      name: "portalSuspended",
      length: 5
    };
    exports2.replicationStart = {
      name: "replicationStart",
      length: 4
    };
    exports2.emptyQuery = {
      name: "emptyQuery",
      length: 4
    };
    exports2.copyDone = {
      name: "copyDone",
      length: 4
    };
    var DatabaseError2 = class extends Error {
      constructor(message, length, name) {
        super(message);
        this.length = length;
        this.name = name;
      }
    };
    exports2.DatabaseError = DatabaseError2;
    var CopyDataMessage = class {
      constructor(length, chunk) {
        this.length = length;
        this.chunk = chunk;
        this.name = "copyData";
      }
    };
    exports2.CopyDataMessage = CopyDataMessage;
    var CopyResponse = class {
      constructor(length, name, binary, columnCount) {
        this.length = length;
        this.name = name;
        this.binary = binary;
        this.columnTypes = new Array(columnCount);
      }
    };
    exports2.CopyResponse = CopyResponse;
    var Field = class {
      constructor(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
        this.name = name;
        this.tableID = tableID;
        this.columnID = columnID;
        this.dataTypeID = dataTypeID;
        this.dataTypeSize = dataTypeSize;
        this.dataTypeModifier = dataTypeModifier;
        this.format = format;
      }
    };
    exports2.Field = Field;
    var RowDescriptionMessage = class {
      constructor(length, fieldCount) {
        this.length = length;
        this.fieldCount = fieldCount;
        this.name = "rowDescription";
        this.fields = new Array(this.fieldCount);
      }
    };
    exports2.RowDescriptionMessage = RowDescriptionMessage;
    var ParameterDescriptionMessage = class {
      constructor(length, parameterCount) {
        this.length = length;
        this.parameterCount = parameterCount;
        this.name = "parameterDescription";
        this.dataTypeIDs = new Array(this.parameterCount);
      }
    };
    exports2.ParameterDescriptionMessage = ParameterDescriptionMessage;
    var ParameterStatusMessage = class {
      constructor(length, parameterName, parameterValue) {
        this.length = length;
        this.parameterName = parameterName;
        this.parameterValue = parameterValue;
        this.name = "parameterStatus";
      }
    };
    exports2.ParameterStatusMessage = ParameterStatusMessage;
    var AuthenticationMD5Password = class {
      constructor(length, salt) {
        this.length = length;
        this.salt = salt;
        this.name = "authenticationMD5Password";
      }
    };
    exports2.AuthenticationMD5Password = AuthenticationMD5Password;
    var BackendKeyDataMessage = class {
      constructor(length, processID, secretKey) {
        this.length = length;
        this.processID = processID;
        this.secretKey = secretKey;
        this.name = "backendKeyData";
      }
    };
    exports2.BackendKeyDataMessage = BackendKeyDataMessage;
    var NotificationResponseMessage = class {
      constructor(length, processId, channel, payload) {
        this.length = length;
        this.processId = processId;
        this.channel = channel;
        this.payload = payload;
        this.name = "notification";
      }
    };
    exports2.NotificationResponseMessage = NotificationResponseMessage;
    var ReadyForQueryMessage = class {
      constructor(length, status) {
        this.length = length;
        this.status = status;
        this.name = "readyForQuery";
      }
    };
    exports2.ReadyForQueryMessage = ReadyForQueryMessage;
    var CommandCompleteMessage = class {
      constructor(length, text) {
        this.length = length;
        this.text = text;
        this.name = "commandComplete";
      }
    };
    exports2.CommandCompleteMessage = CommandCompleteMessage;
    var DataRowMessage = class {
      constructor(length, fields) {
        this.length = length;
        this.fields = fields;
        this.name = "dataRow";
        this.fieldCount = fields.length;
      }
    };
    exports2.DataRowMessage = DataRowMessage;
    var NoticeMessage = class {
      constructor(length, message) {
        this.length = length;
        this.message = message;
        this.name = "notice";
      }
    };
    exports2.NoticeMessage = NoticeMessage;
  }
});

// ../../../node_modules/pg-protocol/dist/buffer-writer.js
var require_buffer_writer = __commonJS({
  "../../../node_modules/pg-protocol/dist/buffer-writer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Writer = void 0;
    var Writer = class {
      constructor(size = 256) {
        this.size = size;
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(size);
      }
      ensure(size) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
          const oldBuffer = this.buffer;
          const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
          this.buffer = Buffer.allocUnsafe(newSize);
          oldBuffer.copy(this.buffer);
        }
      }
      addInt32(num) {
        this.ensure(4);
        this.buffer[this.offset++] = num >>> 24 & 255;
        this.buffer[this.offset++] = num >>> 16 & 255;
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addInt16(num) {
        this.ensure(2);
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addCString(string) {
        if (!string) {
          this.ensure(1);
        } else {
          const len = Buffer.byteLength(string);
          this.ensure(len + 1);
          this.buffer.write(string, this.offset, "utf-8");
          this.offset += len;
        }
        this.buffer[this.offset++] = 0;
        return this;
      }
      addString(string = "") {
        const len = Buffer.byteLength(string);
        this.ensure(len);
        this.buffer.write(string, this.offset);
        this.offset += len;
        return this;
      }
      add(otherBuffer) {
        this.ensure(otherBuffer.length);
        otherBuffer.copy(this.buffer, this.offset);
        this.offset += otherBuffer.length;
        return this;
      }
      join(code) {
        if (code) {
          this.buffer[this.headerPosition] = code;
          const length = this.offset - (this.headerPosition + 1);
          this.buffer.writeInt32BE(length, this.headerPosition + 1);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
      }
      flush(code) {
        const result = this.join(code);
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(this.size);
        return result;
      }
    };
    exports2.Writer = Writer;
  }
});

// ../../../node_modules/pg-protocol/dist/serializer.js
var require_serializer = __commonJS({
  "../../../node_modules/pg-protocol/dist/serializer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.serialize = void 0;
    var buffer_writer_1 = require_buffer_writer();
    var writer = new buffer_writer_1.Writer();
    var startup = (opts) => {
      writer.addInt16(3).addInt16(0);
      for (const key of Object.keys(opts)) {
        writer.addCString(key).addCString(opts[key]);
      }
      writer.addCString("client_encoding").addCString("UTF8");
      const bodyBuffer = writer.addCString("").flush();
      const length = bodyBuffer.length + 4;
      return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
    };
    var requestSsl = () => {
      const response = Buffer.allocUnsafe(8);
      response.writeInt32BE(8, 0);
      response.writeInt32BE(80877103, 4);
      return response;
    };
    var password = (password2) => {
      return writer.addCString(password2).flush(
        112
        /* code.startup */
      );
    };
    var sendSASLInitialResponseMessage = function(mechanism, initialResponse) {
      writer.addCString(mechanism).addInt32(Buffer.byteLength(initialResponse)).addString(initialResponse);
      return writer.flush(
        112
        /* code.startup */
      );
    };
    var sendSCRAMClientFinalMessage = function(additionalData) {
      return writer.addString(additionalData).flush(
        112
        /* code.startup */
      );
    };
    var query = (text) => {
      return writer.addCString(text).flush(
        81
        /* code.query */
      );
    };
    var emptyArray = [];
    var parse2 = (query2) => {
      const name = query2.name || "";
      if (name.length > 63) {
        console.error("Warning! Postgres only supports 63 characters for query names.");
        console.error("You supplied %s (%s)", name, name.length);
        console.error("This can cause conflicts and silent errors executing queries");
      }
      const types2 = query2.types || emptyArray;
      const len = types2.length;
      const buffer = writer.addCString(name).addCString(query2.text).addInt16(len);
      for (let i = 0; i < len; i++) {
        buffer.addInt32(types2[i]);
      }
      return writer.flush(
        80
        /* code.parse */
      );
    };
    var paramWriter = new buffer_writer_1.Writer();
    var writeValues = function(values, valueMapper) {
      for (let i = 0; i < values.length; i++) {
        const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
        if (mappedVal == null) {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32(-1);
        } else if (mappedVal instanceof Buffer) {
          writer.addInt16(
            1
            /* ParamType.BINARY */
          );
          paramWriter.addInt32(mappedVal.length);
          paramWriter.add(mappedVal);
        } else {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32(Buffer.byteLength(mappedVal));
          paramWriter.addString(mappedVal);
        }
      }
    };
    var bind = (config = {}) => {
      const portal = config.portal || "";
      const statement = config.statement || "";
      const binary = config.binary || false;
      const values = config.values || emptyArray;
      const len = values.length;
      writer.addCString(portal).addCString(statement);
      writer.addInt16(len);
      writeValues(values, config.valueMapper);
      writer.addInt16(len);
      writer.add(paramWriter.flush());
      writer.addInt16(1);
      writer.addInt16(
        binary ? 1 : 0
        /* ParamType.STRING */
      );
      return writer.flush(
        66
        /* code.bind */
      );
    };
    var emptyExecute = Buffer.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
    var execute = (config) => {
      if (!config || !config.portal && !config.rows) {
        return emptyExecute;
      }
      const portal = config.portal || "";
      const rows = config.rows || 0;
      const portalLength = Buffer.byteLength(portal);
      const len = 4 + portalLength + 1 + 4;
      const buff = Buffer.allocUnsafe(1 + len);
      buff[0] = 69;
      buff.writeInt32BE(len, 1);
      buff.write(portal, 5, "utf-8");
      buff[portalLength + 5] = 0;
      buff.writeUInt32BE(rows, buff.length - 4);
      return buff;
    };
    var cancel = (processID, secretKey) => {
      const buffer = Buffer.allocUnsafe(16);
      buffer.writeInt32BE(16, 0);
      buffer.writeInt16BE(1234, 4);
      buffer.writeInt16BE(5678, 6);
      buffer.writeInt32BE(processID, 8);
      buffer.writeInt32BE(secretKey, 12);
      return buffer;
    };
    var cstringMessage = (code, string) => {
      const stringLen = Buffer.byteLength(string);
      const len = 4 + stringLen + 1;
      const buffer = Buffer.allocUnsafe(1 + len);
      buffer[0] = code;
      buffer.writeInt32BE(len, 1);
      buffer.write(string, 5, "utf-8");
      buffer[len] = 0;
      return buffer;
    };
    var emptyDescribePortal = writer.addCString("P").flush(
      68
      /* code.describe */
    );
    var emptyDescribeStatement = writer.addCString("S").flush(
      68
      /* code.describe */
    );
    var describe = (msg) => {
      return msg.name ? cstringMessage(68, `${msg.type}${msg.name || ""}`) : msg.type === "P" ? emptyDescribePortal : emptyDescribeStatement;
    };
    var close = (msg) => {
      const text = `${msg.type}${msg.name || ""}`;
      return cstringMessage(67, text);
    };
    var copyData = (chunk) => {
      return writer.add(chunk).flush(
        100
        /* code.copyFromChunk */
      );
    };
    var copyFail = (message) => {
      return cstringMessage(102, message);
    };
    var codeOnlyBuffer = (code) => Buffer.from([code, 0, 0, 0, 4]);
    var flushBuffer = codeOnlyBuffer(
      72
      /* code.flush */
    );
    var syncBuffer = codeOnlyBuffer(
      83
      /* code.sync */
    );
    var endBuffer = codeOnlyBuffer(
      88
      /* code.end */
    );
    var copyDoneBuffer = codeOnlyBuffer(
      99
      /* code.copyDone */
    );
    var serialize = {
      startup,
      password,
      requestSsl,
      sendSASLInitialResponseMessage,
      sendSCRAMClientFinalMessage,
      query,
      parse: parse2,
      bind,
      execute,
      describe,
      close,
      flush: () => flushBuffer,
      sync: () => syncBuffer,
      end: () => endBuffer,
      copyData,
      copyDone: () => copyDoneBuffer,
      copyFail,
      cancel
    };
    exports2.serialize = serialize;
  }
});

// ../../../node_modules/pg-protocol/dist/buffer-reader.js
var require_buffer_reader = __commonJS({
  "../../../node_modules/pg-protocol/dist/buffer-reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BufferReader = void 0;
    var BufferReader = class {
      constructor(offset = 0) {
        this.offset = offset;
        this.buffer = Buffer.allocUnsafe(0);
        this.encoding = "utf-8";
      }
      setBuffer(offset, buffer) {
        this.offset = offset;
        this.buffer = buffer;
      }
      int16() {
        const result = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return result;
      }
      byte() {
        const result = this.buffer[this.offset];
        this.offset++;
        return result;
      }
      int32() {
        const result = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      uint32() {
        const result = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      string(length) {
        const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
      cstring() {
        const start = this.offset;
        let end = start;
        while (this.buffer[end++] !== 0) {
        }
        this.offset = end;
        return this.buffer.toString(this.encoding, start, end - 1);
      }
      bytes(length) {
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
    };
    exports2.BufferReader = BufferReader;
  }
});

// ../../../node_modules/pg-protocol/dist/parser.js
var require_parser2 = __commonJS({
  "../../../node_modules/pg-protocol/dist/parser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Parser = void 0;
    var messages_1 = require_messages();
    var buffer_reader_1 = require_buffer_reader();
    var CODE_LENGTH = 1;
    var LEN_LENGTH = 4;
    var HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
    var LATEINIT_LENGTH = -1;
    var emptyBuffer = Buffer.allocUnsafe(0);
    var Parser = class {
      constructor(opts) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new buffer_reader_1.BufferReader();
        if ((opts === null || opts === void 0 ? void 0 : opts.mode) === "binary") {
          throw new Error("Binary mode not supported yet");
        }
        this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || "text";
      }
      parse(buffer, callback) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
          const code = this.buffer[offset];
          const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
          const fullMessageLength = CODE_LENGTH + length;
          if (fullMessageLength + offset <= bufferFullLength) {
            const message = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
            callback(message);
            offset += fullMessageLength;
          } else {
            break;
          }
        }
        if (offset === bufferFullLength) {
          this.buffer = emptyBuffer;
          this.bufferLength = 0;
          this.bufferOffset = 0;
        } else {
          this.bufferLength = bufferFullLength - offset;
          this.bufferOffset = offset;
        }
      }
      mergeBuffer(buffer) {
        if (this.bufferLength > 0) {
          const newLength = this.bufferLength + buffer.byteLength;
          const newFullLength = newLength + this.bufferOffset;
          if (newFullLength > this.buffer.byteLength) {
            let newBuffer;
            if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
              newBuffer = this.buffer;
            } else {
              let newBufferLength = this.buffer.byteLength * 2;
              while (newLength >= newBufferLength) {
                newBufferLength *= 2;
              }
              newBuffer = Buffer.allocUnsafe(newBufferLength);
            }
            this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
            this.buffer = newBuffer;
            this.bufferOffset = 0;
          }
          buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
          this.bufferLength = newLength;
        } else {
          this.buffer = buffer;
          this.bufferOffset = 0;
          this.bufferLength = buffer.byteLength;
        }
      }
      handlePacket(offset, code, length, bytes) {
        const { reader } = this;
        reader.setBuffer(offset, bytes);
        let message;
        switch (code) {
          case 50:
            message = messages_1.bindComplete;
            break;
          case 49:
            message = messages_1.parseComplete;
            break;
          case 51:
            message = messages_1.closeComplete;
            break;
          case 110:
            message = messages_1.noData;
            break;
          case 115:
            message = messages_1.portalSuspended;
            break;
          case 99:
            message = messages_1.copyDone;
            break;
          case 87:
            message = messages_1.replicationStart;
            break;
          case 73:
            message = messages_1.emptyQuery;
            break;
          case 68:
            message = parseDataRowMessage(reader);
            break;
          case 67:
            message = parseCommandCompleteMessage(reader);
            break;
          case 90:
            message = parseReadyForQueryMessage(reader);
            break;
          case 65:
            message = parseNotificationMessage(reader);
            break;
          case 82:
            message = parseAuthenticationResponse(reader, length);
            break;
          case 83:
            message = parseParameterStatusMessage(reader);
            break;
          case 75:
            message = parseBackendKeyData(reader);
            break;
          case 69:
            message = parseErrorMessage(reader, "error");
            break;
          case 78:
            message = parseErrorMessage(reader, "notice");
            break;
          case 84:
            message = parseRowDescriptionMessage(reader);
            break;
          case 116:
            message = parseParameterDescriptionMessage(reader);
            break;
          case 71:
            message = parseCopyInMessage(reader);
            break;
          case 72:
            message = parseCopyOutMessage(reader);
            break;
          case 100:
            message = parseCopyData(reader, length);
            break;
          default:
            return new messages_1.DatabaseError("received invalid response: " + code.toString(16), length, "error");
        }
        reader.setBuffer(0, emptyBuffer);
        message.length = length;
        return message;
      }
    };
    exports2.Parser = Parser;
    var parseReadyForQueryMessage = (reader) => {
      const status = reader.string(1);
      return new messages_1.ReadyForQueryMessage(LATEINIT_LENGTH, status);
    };
    var parseCommandCompleteMessage = (reader) => {
      const text = reader.cstring();
      return new messages_1.CommandCompleteMessage(LATEINIT_LENGTH, text);
    };
    var parseCopyData = (reader, length) => {
      const chunk = reader.bytes(length - 4);
      return new messages_1.CopyDataMessage(LATEINIT_LENGTH, chunk);
    };
    var parseCopyInMessage = (reader) => parseCopyMessage(reader, "copyInResponse");
    var parseCopyOutMessage = (reader) => parseCopyMessage(reader, "copyOutResponse");
    var parseCopyMessage = (reader, messageName) => {
      const isBinary = reader.byte() !== 0;
      const columnCount = reader.int16();
      const message = new messages_1.CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount);
      for (let i = 0; i < columnCount; i++) {
        message.columnTypes[i] = reader.int16();
      }
      return message;
    };
    var parseNotificationMessage = (reader) => {
      const processId = reader.int32();
      const channel = reader.cstring();
      const payload = reader.cstring();
      return new messages_1.NotificationResponseMessage(LATEINIT_LENGTH, processId, channel, payload);
    };
    var parseRowDescriptionMessage = (reader) => {
      const fieldCount = reader.int16();
      const message = new messages_1.RowDescriptionMessage(LATEINIT_LENGTH, fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        message.fields[i] = parseField(reader);
      }
      return message;
    };
    var parseField = (reader) => {
      const name = reader.cstring();
      const tableID = reader.uint32();
      const columnID = reader.int16();
      const dataTypeID = reader.uint32();
      const dataTypeSize = reader.int16();
      const dataTypeModifier = reader.int32();
      const mode = reader.int16() === 0 ? "text" : "binary";
      return new messages_1.Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
    };
    var parseParameterDescriptionMessage = (reader) => {
      const parameterCount = reader.int16();
      const message = new messages_1.ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount);
      for (let i = 0; i < parameterCount; i++) {
        message.dataTypeIDs[i] = reader.int32();
      }
      return message;
    };
    var parseDataRowMessage = (reader) => {
      const fieldCount = reader.int16();
      const fields = new Array(fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        const len = reader.int32();
        fields[i] = len === -1 ? null : reader.string(len);
      }
      return new messages_1.DataRowMessage(LATEINIT_LENGTH, fields);
    };
    var parseParameterStatusMessage = (reader) => {
      const name = reader.cstring();
      const value = reader.cstring();
      return new messages_1.ParameterStatusMessage(LATEINIT_LENGTH, name, value);
    };
    var parseBackendKeyData = (reader) => {
      const processID = reader.int32();
      const secretKey = reader.int32();
      return new messages_1.BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey);
    };
    var parseAuthenticationResponse = (reader, length) => {
      const code = reader.int32();
      const message = {
        name: "authenticationOk",
        length
      };
      switch (code) {
        case 0:
          break;
        case 3:
          if (message.length === 8) {
            message.name = "authenticationCleartextPassword";
          }
          break;
        case 5:
          if (message.length === 12) {
            message.name = "authenticationMD5Password";
            const salt = reader.bytes(4);
            return new messages_1.AuthenticationMD5Password(LATEINIT_LENGTH, salt);
          }
          break;
        case 10:
          {
            message.name = "authenticationSASL";
            message.mechanisms = [];
            let mechanism;
            do {
              mechanism = reader.cstring();
              if (mechanism) {
                message.mechanisms.push(mechanism);
              }
            } while (mechanism);
          }
          break;
        case 11:
          message.name = "authenticationSASLContinue";
          message.data = reader.string(length - 8);
          break;
        case 12:
          message.name = "authenticationSASLFinal";
          message.data = reader.string(length - 8);
          break;
        default:
          throw new Error("Unknown authenticationOk message type " + code);
      }
      return message;
    };
    var parseErrorMessage = (reader, name) => {
      const fields = {};
      let fieldType = reader.string(1);
      while (fieldType !== "\0") {
        fields[fieldType] = reader.cstring();
        fieldType = reader.string(1);
      }
      const messageValue = fields.M;
      const message = name === "notice" ? new messages_1.NoticeMessage(LATEINIT_LENGTH, messageValue) : new messages_1.DatabaseError(messageValue, LATEINIT_LENGTH, name);
      message.severity = fields.S;
      message.code = fields.C;
      message.detail = fields.D;
      message.hint = fields.H;
      message.position = fields.P;
      message.internalPosition = fields.p;
      message.internalQuery = fields.q;
      message.where = fields.W;
      message.schema = fields.s;
      message.table = fields.t;
      message.column = fields.c;
      message.dataType = fields.d;
      message.constraint = fields.n;
      message.file = fields.F;
      message.line = fields.L;
      message.routine = fields.R;
      return message;
    };
  }
});

// ../../../node_modules/pg-protocol/dist/index.js
var require_dist = __commonJS({
  "../../../node_modules/pg-protocol/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DatabaseError = exports2.serialize = exports2.parse = void 0;
    var messages_1 = require_messages();
    Object.defineProperty(exports2, "DatabaseError", { enumerable: true, get: function() {
      return messages_1.DatabaseError;
    } });
    var serializer_1 = require_serializer();
    Object.defineProperty(exports2, "serialize", { enumerable: true, get: function() {
      return serializer_1.serialize;
    } });
    var parser_1 = require_parser2();
    function parse2(stream, callback) {
      const parser = new parser_1.Parser();
      stream.on("data", (buffer) => parser.parse(buffer, callback));
      return new Promise((resolve) => stream.on("end", () => resolve()));
    }
    exports2.parse = parse2;
  }
});

// ../../../node_modules/pg-cloudflare/dist/empty.js
var require_empty = __commonJS({
  "../../../node_modules/pg-cloudflare/dist/empty.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = {};
  }
});

// ../../../node_modules/pg/lib/stream.js
var require_stream = __commonJS({
  "../../../node_modules/pg/lib/stream.js"(exports2, module2) {
    var { getStream, getSecureStream } = getStreamFuncs();
    module2.exports = {
      /**
       * Get a socket stream compatible with the current runtime environment.
       * @returns {Duplex}
       */
      getStream,
      /**
       * Get a TLS secured socket, compatible with the current environment,
       * using the socket and other settings given in `options`.
       * @returns {Duplex}
       */
      getSecureStream
    };
    function getNodejsStreamFuncs() {
      function getStream2(ssl) {
        const net = require("net");
        return new net.Socket();
      }
      function getSecureStream2(options2) {
        const tls = require("tls");
        return tls.connect(options2);
      }
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    function getCloudflareStreamFuncs() {
      function getStream2(ssl) {
        const { CloudflareSocket } = require_empty();
        return new CloudflareSocket(ssl);
      }
      function getSecureStream2(options2) {
        options2.socket.startTls(options2);
        return options2.socket;
      }
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    function isCloudflareRuntime() {
      if (typeof navigator === "object" && navigator !== null && typeof navigator.userAgent === "string") {
        return navigator.userAgent === "Cloudflare-Workers";
      }
      if (typeof Response === "function") {
        const resp = new Response(null, { cf: { thing: true } });
        if (typeof resp.cf === "object" && resp.cf !== null && resp.cf.thing) {
          return true;
        }
      }
      return false;
    }
    function getStreamFuncs() {
      if (isCloudflareRuntime()) {
        return getCloudflareStreamFuncs();
      }
      return getNodejsStreamFuncs();
    }
  }
});

// ../../../node_modules/pg/lib/connection.js
var require_connection = __commonJS({
  "../../../node_modules/pg/lib/connection.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events").EventEmitter;
    var { parse: parse2, serialize } = require_dist();
    var { getStream, getSecureStream } = require_stream();
    var flushBuffer = serialize.flush();
    var syncBuffer = serialize.sync();
    var endBuffer = serialize.end();
    var Connection2 = class extends EventEmitter {
      constructor(config) {
        super();
        config = config || {};
        this.stream = config.stream || getStream(config.ssl);
        if (typeof this.stream === "function") {
          this.stream = this.stream(config);
        }
        this._keepAlive = config.keepAlive;
        this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis;
        this.parsedStatements = {};
        this.ssl = config.ssl || false;
        this._ending = false;
        this._emitMessage = false;
        const self = this;
        this.on("newListener", function(eventName) {
          if (eventName === "message") {
            self._emitMessage = true;
          }
        });
      }
      connect(port, host) {
        const self = this;
        this._connecting = true;
        this.stream.setNoDelay(true);
        this.stream.connect(port, host);
        this.stream.once("connect", function() {
          if (self._keepAlive) {
            self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis);
          }
          self.emit("connect");
        });
        const reportStreamError = function(error) {
          if (self._ending && (error.code === "ECONNRESET" || error.code === "EPIPE")) {
            return;
          }
          self.emit("error", error);
        };
        this.stream.on("error", reportStreamError);
        this.stream.on("close", function() {
          self.emit("end");
        });
        if (!this.ssl) {
          return this.attachListeners(this.stream);
        }
        this.stream.once("data", function(buffer) {
          const responseCode = buffer.toString("utf8");
          switch (responseCode) {
            case "S":
              break;
            case "N":
              self.stream.end();
              return self.emit("error", new Error("The server does not support SSL connections"));
            default:
              self.stream.end();
              return self.emit("error", new Error("There was an error establishing an SSL connection"));
          }
          const options2 = {
            socket: self.stream
          };
          if (self.ssl !== true) {
            Object.assign(options2, self.ssl);
            if ("key" in self.ssl) {
              options2.key = self.ssl.key;
            }
          }
          const net = require("net");
          if (net.isIP && net.isIP(host) === 0) {
            options2.servername = host;
          }
          try {
            self.stream = getSecureStream(options2);
          } catch (err) {
            return self.emit("error", err);
          }
          self.attachListeners(self.stream);
          self.stream.on("error", reportStreamError);
          self.emit("sslconnect");
        });
      }
      attachListeners(stream) {
        parse2(stream, (msg) => {
          const eventName = msg.name === "error" ? "errorMessage" : msg.name;
          if (this._emitMessage) {
            this.emit("message", msg);
          }
          this.emit(eventName, msg);
        });
      }
      requestSsl() {
        this.stream.write(serialize.requestSsl());
      }
      startup(config) {
        this.stream.write(serialize.startup(config));
      }
      cancel(processID, secretKey) {
        this._send(serialize.cancel(processID, secretKey));
      }
      password(password) {
        this._send(serialize.password(password));
      }
      sendSASLInitialResponseMessage(mechanism, initialResponse) {
        this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse));
      }
      sendSCRAMClientFinalMessage(additionalData) {
        this._send(serialize.sendSCRAMClientFinalMessage(additionalData));
      }
      _send(buffer) {
        if (!this.stream.writable) {
          return false;
        }
        return this.stream.write(buffer);
      }
      query(text) {
        this._send(serialize.query(text));
      }
      // send parse message
      parse(query) {
        this._send(serialize.parse(query));
      }
      // send bind message
      bind(config) {
        this._send(serialize.bind(config));
      }
      // send execute message
      execute(config) {
        this._send(serialize.execute(config));
      }
      flush() {
        if (this.stream.writable) {
          this.stream.write(flushBuffer);
        }
      }
      sync() {
        this._ending = true;
        this._send(syncBuffer);
      }
      ref() {
        this.stream.ref();
      }
      unref() {
        this.stream.unref();
      }
      end() {
        this._ending = true;
        if (!this._connecting || !this.stream.writable) {
          this.stream.end();
          return;
        }
        return this.stream.write(endBuffer, () => {
          this.stream.end();
        });
      }
      close(msg) {
        this._send(serialize.close(msg));
      }
      describe(msg) {
        this._send(serialize.describe(msg));
      }
      sendCopyFromChunk(chunk) {
        this._send(serialize.copyData(chunk));
      }
      endCopyFrom() {
        this._send(serialize.copyDone());
      }
      sendCopyFail(msg) {
        this._send(serialize.copyFail(msg));
      }
    };
    module2.exports = Connection2;
  }
});

// ../../../node_modules/split2/index.js
var require_split2 = __commonJS({
  "../../../node_modules/split2/index.js"(exports2, module2) {
    "use strict";
    var { Transform } = require("stream");
    var { StringDecoder } = require("string_decoder");
    var kLast = /* @__PURE__ */ Symbol("last");
    var kDecoder = /* @__PURE__ */ Symbol("decoder");
    function transform(chunk, enc, cb) {
      let list;
      if (this.overflow) {
        const buf = this[kDecoder].write(chunk);
        list = buf.split(this.matcher);
        if (list.length === 1) return cb();
        list.shift();
        this.overflow = false;
      } else {
        this[kLast] += this[kDecoder].write(chunk);
        list = this[kLast].split(this.matcher);
      }
      this[kLast] = list.pop();
      for (let i = 0; i < list.length; i++) {
        try {
          push(this, this.mapper(list[i]));
        } catch (error) {
          return cb(error);
        }
      }
      this.overflow = this[kLast].length > this.maxLength;
      if (this.overflow && !this.skipOverflow) {
        cb(new Error("maximum buffer reached"));
        return;
      }
      cb();
    }
    function flush(cb) {
      this[kLast] += this[kDecoder].end();
      if (this[kLast]) {
        try {
          push(this, this.mapper(this[kLast]));
        } catch (error) {
          return cb(error);
        }
      }
      cb();
    }
    function push(self, val) {
      if (val !== void 0) {
        self.push(val);
      }
    }
    function noop(incoming) {
      return incoming;
    }
    function split(matcher, mapper, options2) {
      matcher = matcher || /\r?\n/;
      mapper = mapper || noop;
      options2 = options2 || {};
      switch (arguments.length) {
        case 1:
          if (typeof matcher === "function") {
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof matcher === "object" && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
            options2 = matcher;
            matcher = /\r?\n/;
          }
          break;
        case 2:
          if (typeof matcher === "function") {
            options2 = mapper;
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof mapper === "object") {
            options2 = mapper;
            mapper = noop;
          }
      }
      options2 = Object.assign({}, options2);
      options2.autoDestroy = true;
      options2.transform = transform;
      options2.flush = flush;
      options2.readableObjectMode = true;
      const stream = new Transform(options2);
      stream[kLast] = "";
      stream[kDecoder] = new StringDecoder("utf8");
      stream.matcher = matcher;
      stream.mapper = mapper;
      stream.maxLength = options2.maxLength;
      stream.skipOverflow = options2.skipOverflow || false;
      stream.overflow = false;
      stream._destroy = function(err, cb) {
        this._writableState.errorEmitted = false;
        cb(err);
      };
      return stream;
    }
    module2.exports = split;
  }
});

// ../../../node_modules/pgpass/lib/helper.js
var require_helper = __commonJS({
  "../../../node_modules/pgpass/lib/helper.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var Stream = require("stream").Stream;
    var split = require_split2();
    var util = require("util");
    var defaultPort = 5432;
    var isWin = process.platform === "win32";
    var warnStream = process.stderr;
    var S_IRWXG = 56;
    var S_IRWXO = 7;
    var S_IFMT = 61440;
    var S_IFREG = 32768;
    function isRegFile(mode) {
      return (mode & S_IFMT) == S_IFREG;
    }
    var fieldNames = ["host", "port", "database", "user", "password"];
    var nrOfFields = fieldNames.length;
    var passKey = fieldNames[nrOfFields - 1];
    function warn() {
      var isWritable = warnStream instanceof Stream && true === warnStream.writable;
      if (isWritable) {
        var args = Array.prototype.slice.call(arguments).concat("\n");
        warnStream.write(util.format.apply(util, args));
      }
    }
    Object.defineProperty(module2.exports, "isWin", {
      get: function() {
        return isWin;
      },
      set: function(val) {
        isWin = val;
      }
    });
    module2.exports.warnTo = function(stream) {
      var old = warnStream;
      warnStream = stream;
      return old;
    };
    module2.exports.getFileName = function(rawEnv) {
      var env = rawEnv || process.env;
      var file = env.PGPASSFILE || (isWin ? path.join(env.APPDATA || "./", "postgresql", "pgpass.conf") : path.join(env.HOME || "./", ".pgpass"));
      return file;
    };
    module2.exports.usePgPass = function(stats, fname) {
      if (Object.prototype.hasOwnProperty.call(process.env, "PGPASSWORD")) {
        return false;
      }
      if (isWin) {
        return true;
      }
      fname = fname || "<unkn>";
      if (!isRegFile(stats.mode)) {
        warn('WARNING: password file "%s" is not a plain file', fname);
        return false;
      }
      if (stats.mode & (S_IRWXG | S_IRWXO)) {
        warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
        return false;
      }
      return true;
    };
    var matcher = module2.exports.match = function(connInfo, entry) {
      return fieldNames.slice(0, -1).reduce(function(prev, field, idx) {
        if (idx == 1) {
          if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
            return prev && true;
          }
        }
        return prev && (entry[field] === "*" || entry[field] === connInfo[field]);
      }, true);
    };
    module2.exports.getPassword = function(connInfo, stream, cb) {
      var pass;
      var lineStream = stream.pipe(split());
      function onLine(line) {
        var entry = parseLine(line);
        if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
          pass = entry[passKey];
          lineStream.end();
        }
      }
      var onEnd = function() {
        stream.destroy();
        cb(pass);
      };
      var onErr = function(err) {
        stream.destroy();
        warn("WARNING: error on reading file: %s", err);
        cb(void 0);
      };
      stream.on("error", onErr);
      lineStream.on("data", onLine).on("end", onEnd).on("error", onErr);
    };
    var parseLine = module2.exports.parseLine = function(line) {
      if (line.length < 11 || line.match(/^\s+#/)) {
        return null;
      }
      var curChar = "";
      var prevChar = "";
      var fieldIdx = 0;
      var startIdx = 0;
      var endIdx = 0;
      var obj = {};
      var isLastField = false;
      var addToObj = function(idx, i0, i1) {
        var field = line.substring(i0, i1);
        if (!Object.hasOwnProperty.call(process.env, "PGPASS_NO_DEESCAPE")) {
          field = field.replace(/\\([:\\])/g, "$1");
        }
        obj[fieldNames[idx]] = field;
      };
      for (var i = 0; i < line.length - 1; i += 1) {
        curChar = line.charAt(i + 1);
        prevChar = line.charAt(i);
        isLastField = fieldIdx == nrOfFields - 1;
        if (isLastField) {
          addToObj(fieldIdx, startIdx);
          break;
        }
        if (i >= 0 && curChar == ":" && prevChar !== "\\") {
          addToObj(fieldIdx, startIdx, i + 1);
          startIdx = i + 2;
          fieldIdx += 1;
        }
      }
      obj = Object.keys(obj).length === nrOfFields ? obj : null;
      return obj;
    };
    var isValidEntry = module2.exports.isValidEntry = function(entry) {
      var rules = {
        // host
        0: function(x) {
          return x.length > 0;
        },
        // port
        1: function(x) {
          if (x === "*") {
            return true;
          }
          x = Number(x);
          return isFinite(x) && x > 0 && x < 9007199254740992 && Math.floor(x) === x;
        },
        // database
        2: function(x) {
          return x.length > 0;
        },
        // username
        3: function(x) {
          return x.length > 0;
        },
        // password
        4: function(x) {
          return x.length > 0;
        }
      };
      for (var idx = 0; idx < fieldNames.length; idx += 1) {
        var rule = rules[idx];
        var value = entry[fieldNames[idx]] || "";
        var res = rule(value);
        if (!res) {
          return false;
        }
      }
      return true;
    };
  }
});

// ../../../node_modules/pgpass/lib/index.js
var require_lib = __commonJS({
  "../../../node_modules/pgpass/lib/index.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var fs = require("fs");
    var helper = require_helper();
    module2.exports = function(connInfo, cb) {
      var file = helper.getFileName();
      fs.stat(file, function(err, stat) {
        if (err || !helper.usePgPass(stat, file)) {
          return cb(void 0);
        }
        var st = fs.createReadStream(file);
        helper.getPassword(connInfo, st, cb);
      });
    };
    module2.exports.warnTo = helper.warnTo;
  }
});

// ../../../node_modules/pg/lib/client.js
var require_client = __commonJS({
  "../../../node_modules/pg/lib/client.js"(exports2, module2) {
    var EventEmitter = require("events").EventEmitter;
    var utils = require_utils2();
    var nodeUtils = require("util");
    var sasl = require_sasl();
    var TypeOverrides2 = require_type_overrides();
    var ConnectionParameters = require_connection_parameters();
    var Query2 = require_query();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var crypto = require_utils3();
    var activeQueryDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.activeQuery is deprecated and will be removed in pg@9.0"
    );
    var queryQueueDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.queryQueue is deprecated and will be removed in pg@9.0."
    );
    var pgPassDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "pgpass support is deprecated and will be removed in pg@9.0. You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code."
    );
    var byoPromiseDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0."
    );
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    var Client2 = class extends EventEmitter {
      constructor(config) {
        super();
        this.connectionParameters = new ConnectionParameters(config);
        this.user = this.connectionParameters.user;
        this.database = this.connectionParameters.database;
        this.port = this.connectionParameters.port;
        this.host = this.connectionParameters.host;
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: this.connectionParameters.password
        });
        this.replication = this.connectionParameters.replication;
        const c = config || {};
        if (c.Promise) {
          byoPromiseDeprecationNotice();
        }
        this._Promise = c.Promise || global.Promise;
        this._types = new TypeOverrides2(c.types);
        this._ending = false;
        this._ended = false;
        this._connecting = false;
        this._connected = false;
        this._connectionError = false;
        this._queryable = true;
        this._activeQuery = null;
        this.enableChannelBinding = Boolean(c.enableChannelBinding);
        this.connection = c.connection || new Connection2({
          stream: c.stream,
          ssl: this.connectionParameters.ssl,
          keepAlive: c.keepAlive || false,
          keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
          encoding: this.connectionParameters.client_encoding || "utf8"
        });
        this._queryQueue = [];
        this.binary = c.binary || defaults2.binary;
        this.processID = null;
        this.secretKey = null;
        this.ssl = this.connectionParameters.ssl || false;
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0;
      }
      get activeQuery() {
        activeQueryDeprecationNotice();
        return this._activeQuery;
      }
      set activeQuery(val) {
        activeQueryDeprecationNotice();
        this._activeQuery = val;
      }
      _getActiveQuery() {
        return this._activeQuery;
      }
      _errorAllQueries(err) {
        const enqueueError = (query) => {
          process.nextTick(() => {
            query.handleError(err, this.connection);
          });
        };
        const activeQuery = this._getActiveQuery();
        if (activeQuery) {
          enqueueError(activeQuery);
          this._activeQuery = null;
        }
        this._queryQueue.forEach(enqueueError);
        this._queryQueue.length = 0;
      }
      _connect(callback) {
        const self = this;
        const con = this.connection;
        this._connectionCallback = callback;
        if (this._connecting || this._connected) {
          const err = new Error("Client has already been connected. You cannot reuse a client.");
          process.nextTick(() => {
            callback(err);
          });
          return;
        }
        this._connecting = true;
        if (this._connectionTimeoutMillis > 0) {
          this.connectionTimeoutHandle = setTimeout(() => {
            con._ending = true;
            con.stream.destroy(new Error("timeout expired"));
          }, this._connectionTimeoutMillis);
          if (this.connectionTimeoutHandle.unref) {
            this.connectionTimeoutHandle.unref();
          }
        }
        if (this.host && this.host.indexOf("/") === 0) {
          con.connect(this.host + "/.s.PGSQL." + this.port);
        } else {
          con.connect(this.port, this.host);
        }
        con.on("connect", function() {
          if (self.ssl) {
            con.requestSsl();
          } else {
            con.startup(self.getStartupConf());
          }
        });
        con.on("sslconnect", function() {
          con.startup(self.getStartupConf());
        });
        this._attachListeners(con);
        con.once("end", () => {
          const error = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
          clearTimeout(this.connectionTimeoutHandle);
          this._errorAllQueries(error);
          this._ended = true;
          if (!this._ending) {
            if (this._connecting && !this._connectionError) {
              if (this._connectionCallback) {
                this._connectionCallback(error);
              } else {
                this._handleErrorEvent(error);
              }
            } else if (!this._connectionError) {
              this._handleErrorEvent(error);
            }
          }
          process.nextTick(() => {
            this.emit("end");
          });
        });
      }
      connect(callback) {
        if (callback) {
          this._connect(callback);
          return;
        }
        return new this._Promise((resolve, reject) => {
          this._connect((error) => {
            if (error) {
              reject(error);
            } else {
              resolve(this);
            }
          });
        });
      }
      _attachListeners(con) {
        con.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this));
        con.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this));
        con.on("authenticationSASL", this._handleAuthSASL.bind(this));
        con.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this));
        con.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this));
        con.on("backendKeyData", this._handleBackendKeyData.bind(this));
        con.on("error", this._handleErrorEvent.bind(this));
        con.on("errorMessage", this._handleErrorMessage.bind(this));
        con.on("readyForQuery", this._handleReadyForQuery.bind(this));
        con.on("notice", this._handleNotice.bind(this));
        con.on("rowDescription", this._handleRowDescription.bind(this));
        con.on("dataRow", this._handleDataRow.bind(this));
        con.on("portalSuspended", this._handlePortalSuspended.bind(this));
        con.on("emptyQuery", this._handleEmptyQuery.bind(this));
        con.on("commandComplete", this._handleCommandComplete.bind(this));
        con.on("parseComplete", this._handleParseComplete.bind(this));
        con.on("copyInResponse", this._handleCopyInResponse.bind(this));
        con.on("copyData", this._handleCopyData.bind(this));
        con.on("notification", this._handleNotification.bind(this));
      }
      _getPassword(cb) {
        const con = this.connection;
        if (typeof this.password === "function") {
          this._Promise.resolve().then(() => this.password(this.connectionParameters)).then((pass) => {
            if (pass !== void 0) {
              if (typeof pass !== "string") {
                con.emit("error", new TypeError("Password must be a string"));
                return;
              }
              this.connectionParameters.password = this.password = pass;
            } else {
              this.connectionParameters.password = this.password = null;
            }
            cb();
          }).catch((err) => {
            con.emit("error", err);
          });
        } else if (this.password !== null) {
          cb();
        } else {
          try {
            const pgPass = require_lib();
            pgPass(this.connectionParameters, (pass) => {
              if (void 0 !== pass) {
                pgPassDeprecationNotice();
                this.connectionParameters.password = this.password = pass;
              }
              cb();
            });
          } catch (e) {
            this.emit("error", e);
          }
        }
      }
      _handleAuthCleartextPassword(msg) {
        this._getPassword(() => {
          this.connection.password(this.password);
        });
      }
      _handleAuthMD5Password(msg) {
        this._getPassword(async () => {
          try {
            const hashedPassword = await crypto.postgresMd5PasswordHash(this.user, this.password, msg.salt);
            this.connection.password(hashedPassword);
          } catch (e) {
            this.emit("error", e);
          }
        });
      }
      _handleAuthSASL(msg) {
        this._getPassword(() => {
          try {
            this.saslSession = sasl.startSession(msg.mechanisms, this.enableChannelBinding && this.connection.stream);
            this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response);
          } catch (err) {
            this.connection.emit("error", err);
          }
        });
      }
      async _handleAuthSASLContinue(msg) {
        try {
          await sasl.continueSession(
            this.saslSession,
            this.password,
            msg.data,
            this.enableChannelBinding && this.connection.stream
          );
          this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleAuthSASLFinal(msg) {
        try {
          sasl.finalizeSession(this.saslSession, msg.data);
          this.saslSession = null;
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleBackendKeyData(msg) {
        this.processID = msg.processID;
        this.secretKey = msg.secretKey;
      }
      _handleReadyForQuery(msg) {
        if (this._connecting) {
          this._connecting = false;
          this._connected = true;
          clearTimeout(this.connectionTimeoutHandle);
          if (this._connectionCallback) {
            this._connectionCallback(null, this);
            this._connectionCallback = null;
          }
          this.emit("connect");
        }
        const activeQuery = this._getActiveQuery();
        this._activeQuery = null;
        this.readyForQuery = true;
        if (activeQuery) {
          activeQuery.handleReadyForQuery(this.connection);
        }
        this._pulseQueryQueue();
      }
      // if we receive an error event or error message
      // during the connection process we handle it here
      _handleErrorWhileConnecting(err) {
        if (this._connectionError) {
          return;
        }
        this._connectionError = true;
        clearTimeout(this.connectionTimeoutHandle);
        if (this._connectionCallback) {
          return this._connectionCallback(err);
        }
        this.emit("error", err);
      }
      // if we're connected and we receive an error event from the connection
      // this means the socket is dead - do a hard abort of all queries and emit
      // the socket error on the client as well
      _handleErrorEvent(err) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(err);
        }
        this._queryable = false;
        this._errorAllQueries(err);
        this.emit("error", err);
      }
      // handle error messages from the postgres backend
      _handleErrorMessage(msg) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(msg);
        }
        const activeQuery = this._getActiveQuery();
        if (!activeQuery) {
          this._handleErrorEvent(msg);
          return;
        }
        this._activeQuery = null;
        activeQuery.handleError(msg, this.connection);
      }
      _handleRowDescription(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected rowDescription message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleRowDescription(msg);
      }
      _handleDataRow(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected dataRow message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleDataRow(msg);
      }
      _handlePortalSuspended(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected portalSuspended message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handlePortalSuspended(this.connection);
      }
      _handleEmptyQuery(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected emptyQuery message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleEmptyQuery(this.connection);
      }
      _handleCommandComplete(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected commandComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCommandComplete(msg, this.connection);
      }
      _handleParseComplete() {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected parseComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        if (activeQuery.name) {
          this.connection.parsedStatements[activeQuery.name] = activeQuery.text;
        }
      }
      _handleCopyInResponse(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected copyInResponse message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCopyInResponse(this.connection);
      }
      _handleCopyData(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected copyData message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCopyData(msg, this.connection);
      }
      _handleNotification(msg) {
        this.emit("notification", msg);
      }
      _handleNotice(msg) {
        this.emit("notice", msg);
      }
      getStartupConf() {
        const params = this.connectionParameters;
        const data = {
          user: params.user,
          database: params.database
        };
        const appName = params.application_name || params.fallback_application_name;
        if (appName) {
          data.application_name = appName;
        }
        if (params.replication) {
          data.replication = "" + params.replication;
        }
        if (params.statement_timeout) {
          data.statement_timeout = String(parseInt(params.statement_timeout, 10));
        }
        if (params.lock_timeout) {
          data.lock_timeout = String(parseInt(params.lock_timeout, 10));
        }
        if (params.idle_in_transaction_session_timeout) {
          data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10));
        }
        if (params.options) {
          data.options = params.options;
        }
        return data;
      }
      cancel(client, query) {
        if (client.activeQuery === query) {
          const con = this.connection;
          if (this.host && this.host.indexOf("/") === 0) {
            con.connect(this.host + "/.s.PGSQL." + this.port);
          } else {
            con.connect(this.port, this.host);
          }
          con.on("connect", function() {
            con.cancel(client.processID, client.secretKey);
          });
        } else if (client._queryQueue.indexOf(query) !== -1) {
          client._queryQueue.splice(client._queryQueue.indexOf(query), 1);
        }
      }
      setTypeParser(oid, format, parseFn) {
        return this._types.setTypeParser(oid, format, parseFn);
      }
      getTypeParser(oid, format) {
        return this._types.getTypeParser(oid, format);
      }
      // escapeIdentifier and escapeLiteral moved to utility functions & exported
      // on PG
      // re-exported here for backwards compatibility
      escapeIdentifier(str) {
        return utils.escapeIdentifier(str);
      }
      escapeLiteral(str) {
        return utils.escapeLiteral(str);
      }
      _pulseQueryQueue() {
        if (this.readyForQuery === true) {
          this._activeQuery = this._queryQueue.shift();
          const activeQuery = this._getActiveQuery();
          if (activeQuery) {
            this.readyForQuery = false;
            this.hasExecuted = true;
            const queryError = activeQuery.submit(this.connection);
            if (queryError) {
              process.nextTick(() => {
                activeQuery.handleError(queryError, this.connection);
                this.readyForQuery = true;
                this._pulseQueryQueue();
              });
            }
          } else if (this.hasExecuted) {
            this._activeQuery = null;
            this.emit("drain");
          }
        }
      }
      query(config, values, callback) {
        let query;
        let result;
        let readTimeout;
        let readTimeoutTimer;
        let queryCallback;
        if (config === null || config === void 0) {
          throw new TypeError("Client was passed a null or undefined query");
        } else if (typeof config.submit === "function") {
          readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
          result = query = config;
          if (!query.callback) {
            if (typeof values === "function") {
              query.callback = values;
            } else if (callback) {
              query.callback = callback;
            }
          }
        } else {
          readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
          query = new Query2(config, values, callback);
          if (!query.callback) {
            result = new this._Promise((resolve, reject) => {
              query.callback = (err, res) => err ? reject(err) : resolve(res);
            }).catch((err) => {
              Error.captureStackTrace(err);
              throw err;
            });
          }
        }
        if (readTimeout) {
          queryCallback = query.callback || (() => {
          });
          readTimeoutTimer = setTimeout(() => {
            const error = new Error("Query read timeout");
            process.nextTick(() => {
              query.handleError(error, this.connection);
            });
            queryCallback(error);
            query.callback = () => {
            };
            const index = this._queryQueue.indexOf(query);
            if (index > -1) {
              this._queryQueue.splice(index, 1);
            }
            this._pulseQueryQueue();
          }, readTimeout);
          query.callback = (err, res) => {
            clearTimeout(readTimeoutTimer);
            queryCallback(err, res);
          };
        }
        if (this.binary && !query.binary) {
          query.binary = true;
        }
        if (query._result && !query._result._types) {
          query._result._types = this._types;
        }
        if (!this._queryable) {
          process.nextTick(() => {
            query.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._ending) {
          process.nextTick(() => {
            query.handleError(new Error("Client was closed and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._queryQueue.length > 0) {
          queryQueueLengthDeprecationNotice();
        }
        this._queryQueue.push(query);
        this._pulseQueryQueue();
        return result;
      }
      ref() {
        this.connection.ref();
      }
      unref() {
        this.connection.unref();
      }
      end(cb) {
        this._ending = true;
        if (!this.connection._connecting || this._ended) {
          if (cb) {
            cb();
          } else {
            return this._Promise.resolve();
          }
        }
        if (this._getActiveQuery() || !this._queryable) {
          this.connection.stream.destroy();
        } else {
          this.connection.end();
        }
        if (cb) {
          this.connection.once("end", cb);
        } else {
          return new this._Promise((resolve) => {
            this.connection.once("end", resolve);
          });
        }
      }
      get queryQueue() {
        queryQueueDeprecationNotice();
        return this._queryQueue;
      }
    };
    Client2.Query = Query2;
    module2.exports = Client2;
  }
});

// ../../../node_modules/pg-pool/index.js
var require_pg_pool = __commonJS({
  "../../../node_modules/pg-pool/index.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events").EventEmitter;
    var NOOP = function() {
    };
    var removeWhere = (list, predicate) => {
      const i = list.findIndex(predicate);
      return i === -1 ? void 0 : list.splice(i, 1)[0];
    };
    var IdleItem = class {
      constructor(client, idleListener, timeoutId) {
        this.client = client;
        this.idleListener = idleListener;
        this.timeoutId = timeoutId;
      }
    };
    var PendingItem = class {
      constructor(callback) {
        this.callback = callback;
      }
    };
    function throwOnDoubleRelease() {
      throw new Error("Release called on client which has already been released to the pool.");
    }
    function promisify(Promise2, callback) {
      if (callback) {
        return { callback, result: void 0 };
      }
      let rej;
      let res;
      const cb = function(err, client) {
        err ? rej(err) : res(client);
      };
      const result = new Promise2(function(resolve, reject) {
        res = resolve;
        rej = reject;
      }).catch((err) => {
        Error.captureStackTrace(err);
        throw err;
      });
      return { callback: cb, result };
    }
    function makeIdleListener(pool, client) {
      return function idleListener(err) {
        err.client = client;
        client.removeListener("error", idleListener);
        client.on("error", () => {
          pool.log("additional client error after disconnection due to error", err);
        });
        pool._remove(client);
        pool.emit("error", err, client);
      };
    }
    var Pool2 = class extends EventEmitter {
      constructor(options2, Client2) {
        super();
        this.options = Object.assign({}, options2);
        if (options2 != null && "password" in options2) {
          Object.defineProperty(this.options, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: options2.password
          });
        }
        if (options2 != null && options2.ssl && options2.ssl.key) {
          Object.defineProperty(this.options.ssl, "key", {
            enumerable: false
          });
        }
        this.options.max = this.options.max || this.options.poolSize || 10;
        this.options.min = this.options.min || 0;
        this.options.maxUses = this.options.maxUses || Infinity;
        this.options.allowExitOnIdle = this.options.allowExitOnIdle || false;
        this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0;
        this.log = this.options.log || function() {
        };
        this.Client = this.options.Client || Client2 || require_lib2().Client;
        this.Promise = this.options.Promise || global.Promise;
        if (typeof this.options.idleTimeoutMillis === "undefined") {
          this.options.idleTimeoutMillis = 1e4;
        }
        this._clients = [];
        this._idle = [];
        this._expired = /* @__PURE__ */ new WeakSet();
        this._pendingQueue = [];
        this._endCallback = void 0;
        this.ending = false;
        this.ended = false;
      }
      _promiseTry(f) {
        const Promise2 = this.Promise;
        if (typeof Promise2.try === "function") {
          return Promise2.try(f);
        }
        return new Promise2((resolve) => resolve(f()));
      }
      _isFull() {
        return this._clients.length >= this.options.max;
      }
      _isAboveMin() {
        return this._clients.length > this.options.min;
      }
      _pulseQueue() {
        this.log("pulse queue");
        if (this.ended) {
          this.log("pulse queue ended");
          return;
        }
        if (this.ending) {
          this.log("pulse queue on ending");
          if (this._idle.length) {
            this._idle.slice().map((item) => {
              this._remove(item.client);
            });
          }
          if (!this._clients.length) {
            this.ended = true;
            this._endCallback();
          }
          return;
        }
        if (!this._pendingQueue.length) {
          this.log("no queued requests");
          return;
        }
        if (!this._idle.length && this._isFull()) {
          return;
        }
        const pendingItem = this._pendingQueue.shift();
        if (this._idle.length) {
          const idleItem = this._idle.pop();
          clearTimeout(idleItem.timeoutId);
          const client = idleItem.client;
          client.ref && client.ref();
          const idleListener = idleItem.idleListener;
          return this._acquireClient(client, pendingItem, idleListener, false);
        }
        if (!this._isFull()) {
          return this.newClient(pendingItem);
        }
        throw new Error("unexpected condition");
      }
      _remove(client, callback) {
        const removed = removeWhere(this._idle, (item) => item.client === client);
        if (removed !== void 0) {
          clearTimeout(removed.timeoutId);
        }
        this._clients = this._clients.filter((c) => c !== client);
        const context = this;
        client.end(() => {
          context.emit("remove", client);
          if (typeof callback === "function") {
            callback();
          }
        });
      }
      connect(cb) {
        if (this.ending) {
          const err = new Error("Cannot use a pool after calling end on the pool");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        const response = promisify(this.Promise, cb);
        const result = response.result;
        if (this._isFull() || this._idle.length) {
          if (this._idle.length) {
            process.nextTick(() => this._pulseQueue());
          }
          if (!this.options.connectionTimeoutMillis) {
            this._pendingQueue.push(new PendingItem(response.callback));
            return result;
          }
          const queueCallback = (err, res, done) => {
            clearTimeout(tid);
            response.callback(err, res, done);
          };
          const pendingItem = new PendingItem(queueCallback);
          const tid = setTimeout(() => {
            removeWhere(this._pendingQueue, (i) => i.callback === queueCallback);
            pendingItem.timedOut = true;
            response.callback(new Error("timeout exceeded when trying to connect"));
          }, this.options.connectionTimeoutMillis);
          if (tid.unref) {
            tid.unref();
          }
          this._pendingQueue.push(pendingItem);
          return result;
        }
        this.newClient(new PendingItem(response.callback));
        return result;
      }
      newClient(pendingItem) {
        const client = new this.Client(this.options);
        this._clients.push(client);
        const idleListener = makeIdleListener(this, client);
        this.log("checking client timeout");
        let tid;
        let timeoutHit = false;
        if (this.options.connectionTimeoutMillis) {
          tid = setTimeout(() => {
            if (client.connection) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.connection.stream.destroy();
            } else if (!client.isConnected()) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.end();
            }
          }, this.options.connectionTimeoutMillis);
        }
        this.log("connecting new client");
        client.connect((err) => {
          if (tid) {
            clearTimeout(tid);
          }
          client.on("error", idleListener);
          if (err) {
            this.log("client failed to connect", err);
            this._clients = this._clients.filter((c) => c !== client);
            if (timeoutHit) {
              err = new Error("Connection terminated due to connection timeout", { cause: err });
            }
            this._pulseQueue();
            if (!pendingItem.timedOut) {
              pendingItem.callback(err, void 0, NOOP);
            }
          } else {
            this.log("new client connected");
            if (this.options.onConnect) {
              this._promiseTry(() => this.options.onConnect(client)).then(
                () => {
                  this._afterConnect(client, pendingItem, idleListener);
                },
                (hookErr) => {
                  this._clients = this._clients.filter((c) => c !== client);
                  client.end(() => {
                    this._pulseQueue();
                    if (!pendingItem.timedOut) {
                      pendingItem.callback(hookErr, void 0, NOOP);
                    }
                  });
                }
              );
              return;
            }
            return this._afterConnect(client, pendingItem, idleListener);
          }
        });
      }
      _afterConnect(client, pendingItem, idleListener) {
        if (this.options.maxLifetimeSeconds !== 0) {
          const maxLifetimeTimeout = setTimeout(() => {
            this.log("ending client due to expired lifetime");
            this._expired.add(client);
            const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client);
            if (idleIndex !== -1) {
              this._acquireClient(
                client,
                new PendingItem((err, client2, clientRelease) => clientRelease()),
                idleListener,
                false
              );
            }
          }, this.options.maxLifetimeSeconds * 1e3);
          maxLifetimeTimeout.unref();
          client.once("end", () => clearTimeout(maxLifetimeTimeout));
        }
        return this._acquireClient(client, pendingItem, idleListener, true);
      }
      // acquire a client for a pending work item
      _acquireClient(client, pendingItem, idleListener, isNew) {
        if (isNew) {
          this.emit("connect", client);
        }
        this.emit("acquire", client);
        client.release = this._releaseOnce(client, idleListener);
        client.removeListener("error", idleListener);
        if (!pendingItem.timedOut) {
          if (isNew && this.options.verify) {
            this.options.verify(client, (err) => {
              if (err) {
                client.release(err);
                return pendingItem.callback(err, void 0, NOOP);
              }
              pendingItem.callback(void 0, client, client.release);
            });
          } else {
            pendingItem.callback(void 0, client, client.release);
          }
        } else {
          if (isNew && this.options.verify) {
            this.options.verify(client, client.release);
          } else {
            client.release();
          }
        }
      }
      // returns a function that wraps _release and throws if called more than once
      _releaseOnce(client, idleListener) {
        let released = false;
        return (err) => {
          if (released) {
            throwOnDoubleRelease();
          }
          released = true;
          this._release(client, idleListener, err);
        };
      }
      // release a client back to the poll, include an error
      // to remove it from the pool
      _release(client, idleListener, err) {
        client.on("error", idleListener);
        client._poolUseCount = (client._poolUseCount || 0) + 1;
        this.emit("release", err, client);
        if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
          if (client._poolUseCount >= this.options.maxUses) {
            this.log("remove expended client");
          }
          return this._remove(client, this._pulseQueue.bind(this));
        }
        const isExpired = this._expired.has(client);
        if (isExpired) {
          this.log("remove expired client");
          this._expired.delete(client);
          return this._remove(client, this._pulseQueue.bind(this));
        }
        let tid;
        if (this.options.idleTimeoutMillis && this._isAboveMin()) {
          tid = setTimeout(() => {
            if (this._isAboveMin()) {
              this.log("remove idle client");
              this._remove(client, this._pulseQueue.bind(this));
            }
          }, this.options.idleTimeoutMillis);
          if (this.options.allowExitOnIdle) {
            tid.unref();
          }
        }
        if (this.options.allowExitOnIdle) {
          client.unref();
        }
        this._idle.push(new IdleItem(client, idleListener, tid));
        this._pulseQueue();
      }
      query(text, values, cb) {
        if (typeof text === "function") {
          const response2 = promisify(this.Promise, text);
          setImmediate(function() {
            return response2.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
          });
          return response2.result;
        }
        if (typeof values === "function") {
          cb = values;
          values = void 0;
        }
        const response = promisify(this.Promise, cb);
        cb = response.callback;
        this.connect((err, client) => {
          if (err) {
            return cb(err);
          }
          let clientReleased = false;
          const onError = (err2) => {
            if (clientReleased) {
              return;
            }
            clientReleased = true;
            client.release(err2);
            cb(err2);
          };
          client.once("error", onError);
          this.log("dispatching query");
          try {
            client.query(text, values, (err2, res) => {
              this.log("query dispatched");
              client.removeListener("error", onError);
              if (clientReleased) {
                return;
              }
              clientReleased = true;
              client.release(err2);
              if (err2) {
                return cb(err2);
              }
              return cb(void 0, res);
            });
          } catch (err2) {
            client.release(err2);
            return cb(err2);
          }
        });
        return response.result;
      }
      end(cb) {
        this.log("ending");
        if (this.ending) {
          const err = new Error("Called end on pool more than once");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        this.ending = true;
        const promised = promisify(this.Promise, cb);
        this._endCallback = promised.callback;
        this._pulseQueue();
        return promised.result;
      }
      get waitingCount() {
        return this._pendingQueue.length;
      }
      get idleCount() {
        return this._idle.length;
      }
      get expiredCount() {
        return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0);
      }
      get totalCount() {
        return this._clients.length;
      }
    };
    module2.exports = Pool2;
  }
});

// ../../../node_modules/pg/lib/native/query.js
var require_query2 = __commonJS({
  "../../../node_modules/pg/lib/native/query.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events").EventEmitter;
    var util = require("util");
    var utils = require_utils2();
    var NativeQuery = module2.exports = function(config, values, callback) {
      EventEmitter.call(this);
      config = utils.normalizeQueryConfig(config, values, callback);
      this.text = config.text;
      this.values = config.values;
      this.name = config.name;
      this.queryMode = config.queryMode;
      this.callback = config.callback;
      this.state = "new";
      this._arrayMode = config.rowMode === "array";
      this._emitRowEvents = false;
      this.on(
        "newListener",
        function(event) {
          if (event === "row") this._emitRowEvents = true;
        }.bind(this)
      );
    };
    util.inherits(NativeQuery, EventEmitter);
    var errorFieldMap = {
      sqlState: "code",
      statementPosition: "position",
      messagePrimary: "message",
      context: "where",
      schemaName: "schema",
      tableName: "table",
      columnName: "column",
      dataTypeName: "dataType",
      constraintName: "constraint",
      sourceFile: "file",
      sourceLine: "line",
      sourceFunction: "routine"
    };
    NativeQuery.prototype.handleError = function(err) {
      const fields = this.native.pq.resultErrorFields();
      if (fields) {
        for (const key in fields) {
          const normalizedFieldName = errorFieldMap[key] || key;
          err[normalizedFieldName] = fields[key];
        }
      }
      if (this.callback) {
        this.callback(err);
      } else {
        this.emit("error", err);
      }
      this.state = "error";
    };
    NativeQuery.prototype.then = function(onSuccess, onFailure) {
      return this._getPromise().then(onSuccess, onFailure);
    };
    NativeQuery.prototype.catch = function(callback) {
      return this._getPromise().catch(callback);
    };
    NativeQuery.prototype._getPromise = function() {
      if (this._promise) return this._promise;
      this._promise = new Promise(
        function(resolve, reject) {
          this._once("end", resolve);
          this._once("error", reject);
        }.bind(this)
      );
      return this._promise;
    };
    NativeQuery.prototype.submit = function(client) {
      this.state = "running";
      const self = this;
      this.native = client.native;
      client.native.arrayMode = this._arrayMode;
      let after = function(err, rows, results) {
        client.native.arrayMode = false;
        setImmediate(function() {
          self.emit("_done");
        });
        if (err) {
          return self.handleError(err);
        }
        if (self._emitRowEvents) {
          if (results.length > 1) {
            rows.forEach((rowOfRows, i) => {
              rowOfRows.forEach((row) => {
                self.emit("row", row, results[i]);
              });
            });
          } else {
            rows.forEach(function(row) {
              self.emit("row", row, results);
            });
          }
        }
        self.state = "end";
        self.emit("end", results);
        if (self.callback) {
          self.callback(null, results);
        }
      };
      if (process.domain) {
        after = process.domain.bind(after);
      }
      if (this.name) {
        if (this.name.length > 63) {
          console.error("Warning! Postgres only supports 63 characters for query names.");
          console.error("You supplied %s (%s)", this.name, this.name.length);
          console.error("This can cause conflicts and silent errors executing queries");
        }
        const values = (this.values || []).map(utils.prepareValue);
        if (client.namedQueries[this.name]) {
          if (this.text && client.namedQueries[this.name] !== this.text) {
            const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
            return after(err);
          }
          return client.native.execute(this.name, values, after);
        }
        return client.native.prepare(this.name, this.text, values.length, function(err) {
          if (err) return after(err);
          client.namedQueries[self.name] = self.text;
          return self.native.execute(self.name, values, after);
        });
      } else if (this.values) {
        if (!Array.isArray(this.values)) {
          const err = new Error("Query values must be an array");
          return after(err);
        }
        const vals = this.values.map(utils.prepareValue);
        client.native.query(this.text, vals, after);
      } else if (this.queryMode === "extended") {
        client.native.query(this.text, [], after);
      } else {
        client.native.query(this.text, after);
      }
    };
  }
});

// ../../../node_modules/pg/lib/native/client.js
var require_client2 = __commonJS({
  "../../../node_modules/pg/lib/native/client.js"(exports2, module2) {
    var nodeUtils = require("util");
    var Native;
    try {
      Native = require("pg-native");
    } catch (e) {
      throw e;
    }
    var TypeOverrides2 = require_type_overrides();
    var EventEmitter = require("events").EventEmitter;
    var util = require("util");
    var ConnectionParameters = require_connection_parameters();
    var NativeQuery = require_query2();
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    var Client2 = module2.exports = function(config) {
      EventEmitter.call(this);
      config = config || {};
      this._Promise = config.Promise || global.Promise;
      this._types = new TypeOverrides2(config.types);
      this.native = new Native({
        types: this._types
      });
      this._queryQueue = [];
      this._ending = false;
      this._connecting = false;
      this._connected = false;
      this._queryable = true;
      const cp = this.connectionParameters = new ConnectionParameters(config);
      if (config.nativeConnectionString) cp.nativeConnectionString = config.nativeConnectionString;
      this.user = cp.user;
      Object.defineProperty(this, "password", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: cp.password
      });
      this.database = cp.database;
      this.host = cp.host;
      this.port = cp.port;
      this.namedQueries = {};
    };
    Client2.Query = NativeQuery;
    util.inherits(Client2, EventEmitter);
    Client2.prototype._errorAllQueries = function(err) {
      const enqueueError = (query) => {
        process.nextTick(() => {
          query.native = this.native;
          query.handleError(err);
        });
      };
      if (this._hasActiveQuery()) {
        enqueueError(this._activeQuery);
        this._activeQuery = null;
      }
      this._queryQueue.forEach(enqueueError);
      this._queryQueue.length = 0;
    };
    Client2.prototype._connect = function(cb) {
      const self = this;
      if (this._connecting) {
        process.nextTick(() => cb(new Error("Client has already been connected. You cannot reuse a client.")));
        return;
      }
      this._connecting = true;
      this.connectionParameters.getLibpqConnectionString(function(err, conString) {
        if (self.connectionParameters.nativeConnectionString) conString = self.connectionParameters.nativeConnectionString;
        if (err) return cb(err);
        self.native.connect(conString, function(err2) {
          if (err2) {
            self.native.end();
            return cb(err2);
          }
          self._connected = true;
          self.native.on("error", function(err3) {
            self._queryable = false;
            self._errorAllQueries(err3);
            self.emit("error", err3);
          });
          self.native.on("notification", function(msg) {
            self.emit("notification", {
              channel: msg.relname,
              payload: msg.extra
            });
          });
          self.emit("connect");
          self._pulseQueryQueue(true);
          cb(null, this);
        });
      });
    };
    Client2.prototype.connect = function(callback) {
      if (callback) {
        this._connect(callback);
        return;
      }
      return new this._Promise((resolve, reject) => {
        this._connect((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(this);
          }
        });
      });
    };
    Client2.prototype.query = function(config, values, callback) {
      let query;
      let result;
      let readTimeout;
      let readTimeoutTimer;
      let queryCallback;
      if (config === null || config === void 0) {
        throw new TypeError("Client was passed a null or undefined query");
      } else if (typeof config.submit === "function") {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        result = query = config;
        if (typeof values === "function") {
          config.callback = values;
        }
      } else {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        query = new NativeQuery(config, values, callback);
        if (!query.callback) {
          let resolveOut, rejectOut;
          result = new this._Promise((resolve, reject) => {
            resolveOut = resolve;
            rejectOut = reject;
          }).catch((err) => {
            Error.captureStackTrace(err);
            throw err;
          });
          query.callback = (err, res) => err ? rejectOut(err) : resolveOut(res);
        }
      }
      if (readTimeout) {
        queryCallback = query.callback || (() => {
        });
        readTimeoutTimer = setTimeout(() => {
          const error = new Error("Query read timeout");
          process.nextTick(() => {
            query.handleError(error, this.connection);
          });
          queryCallback(error);
          query.callback = () => {
          };
          const index = this._queryQueue.indexOf(query);
          if (index > -1) {
            this._queryQueue.splice(index, 1);
          }
          this._pulseQueryQueue();
        }, readTimeout);
        query.callback = (err, res) => {
          clearTimeout(readTimeoutTimer);
          queryCallback(err, res);
        };
      }
      if (!this._queryable) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client has encountered a connection error and is not queryable"));
        });
        return result;
      }
      if (this._ending) {
        query.native = this.native;
        process.nextTick(() => {
          query.handleError(new Error("Client was closed and is not queryable"));
        });
        return result;
      }
      if (this._queryQueue.length > 0) {
        queryQueueLengthDeprecationNotice();
      }
      this._queryQueue.push(query);
      this._pulseQueryQueue();
      return result;
    };
    Client2.prototype.end = function(cb) {
      const self = this;
      this._ending = true;
      if (!this._connected) {
        this.once("connect", this.end.bind(this, cb));
      }
      let result;
      if (!cb) {
        result = new this._Promise(function(resolve, reject) {
          cb = (err) => err ? reject(err) : resolve();
        });
      }
      this.native.end(function() {
        self._connected = false;
        self._errorAllQueries(new Error("Connection terminated"));
        process.nextTick(() => {
          self.emit("end");
          if (cb) cb();
        });
      });
      return result;
    };
    Client2.prototype._hasActiveQuery = function() {
      return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
    };
    Client2.prototype._pulseQueryQueue = function(initialConnection) {
      if (!this._connected) {
        return;
      }
      if (this._hasActiveQuery()) {
        return;
      }
      const query = this._queryQueue.shift();
      if (!query) {
        if (!initialConnection) {
          this.emit("drain");
        }
        return;
      }
      this._activeQuery = query;
      query.submit(this);
      const self = this;
      query.once("_done", function() {
        self._pulseQueryQueue();
      });
    };
    Client2.prototype.cancel = function(query) {
      if (this._activeQuery === query) {
        this.native.cancel(function() {
        });
      } else if (this._queryQueue.indexOf(query) !== -1) {
        this._queryQueue.splice(this._queryQueue.indexOf(query), 1);
      }
    };
    Client2.prototype.ref = function() {
    };
    Client2.prototype.unref = function() {
    };
    Client2.prototype.setTypeParser = function(oid, format, parseFn) {
      return this._types.setTypeParser(oid, format, parseFn);
    };
    Client2.prototype.getTypeParser = function(oid, format) {
      return this._types.getTypeParser(oid, format);
    };
    Client2.prototype.isConnected = function() {
      return this._connected;
    };
  }
});

// ../../../node_modules/pg/lib/native/index.js
var require_native = __commonJS({
  "../../../node_modules/pg/lib/native/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_client2();
  }
});

// ../../../node_modules/pg/lib/index.js
var require_lib2 = __commonJS({
  "../../../node_modules/pg/lib/index.js"(exports2, module2) {
    "use strict";
    var Client2 = require_client();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var Result2 = require_result();
    var utils = require_utils2();
    var Pool2 = require_pg_pool();
    var TypeOverrides2 = require_type_overrides();
    var { DatabaseError: DatabaseError2 } = require_dist();
    var { escapeIdentifier: escapeIdentifier2, escapeLiteral: escapeLiteral2 } = require_utils2();
    var poolFactory = (Client3) => {
      return class BoundPool extends Pool2 {
        constructor(options2) {
          super(options2, Client3);
        }
      };
    };
    var PG = function(clientConstructor2) {
      this.defaults = defaults2;
      this.Client = clientConstructor2;
      this.Query = this.Client.Query;
      this.Pool = poolFactory(this.Client);
      this._pools = [];
      this.Connection = Connection2;
      this.types = require_pg_types();
      this.DatabaseError = DatabaseError2;
      this.TypeOverrides = TypeOverrides2;
      this.escapeIdentifier = escapeIdentifier2;
      this.escapeLiteral = escapeLiteral2;
      this.Result = Result2;
      this.utils = utils;
    };
    var clientConstructor = Client2;
    var forceNative = false;
    try {
      forceNative = !!process.env.NODE_PG_FORCE_NATIVE;
    } catch {
    }
    if (forceNative) {
      clientConstructor = require_native();
    }
    module2.exports = new PG(clientConstructor);
    Object.defineProperty(module2.exports, "native", {
      configurable: true,
      enumerable: false,
      get() {
        let native = null;
        try {
          native = new PG(require_native());
        } catch (err) {
          if (err.code !== "MODULE_NOT_FOUND") {
            throw err;
          }
        }
        Object.defineProperty(module2.exports, "native", {
          value: native
        });
        return native;
      }
    });
  }
});

// ../../../node_modules/pg/esm/index.mjs
var esm_exports = {};
__export(esm_exports, {
  Client: () => Client,
  Connection: () => Connection,
  DatabaseError: () => DatabaseError,
  Pool: () => Pool,
  Query: () => Query,
  Result: () => Result,
  TypeOverrides: () => TypeOverrides,
  default: () => esm_default,
  defaults: () => defaults,
  escapeIdentifier: () => escapeIdentifier,
  escapeLiteral: () => escapeLiteral,
  types: () => types
});
var import_lib, Client, Pool, Connection, types, Query, DatabaseError, escapeIdentifier, escapeLiteral, Result, TypeOverrides, defaults, esm_default;
var init_esm = __esm({
  "../../../node_modules/pg/esm/index.mjs"() {
    import_lib = __toESM(require_lib2(), 1);
    Client = import_lib.default.Client;
    Pool = import_lib.default.Pool;
    Connection = import_lib.default.Connection;
    types = import_lib.default.types;
    Query = import_lib.default.Query;
    DatabaseError = import_lib.default.DatabaseError;
    escapeIdentifier = import_lib.default.escapeIdentifier;
    escapeLiteral = import_lib.default.escapeLiteral;
    Result = import_lib.default.Result;
    TypeOverrides = import_lib.default.TypeOverrides;
    defaults = import_lib.default.defaults;
    esm_default = import_lib.default;
  }
});

// src/handlers/update-rule.ts
var update_rule_exports = {};
__export(update_rule_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(update_rule_exports);

// src/dsl/parser.ts
var peggy = __toESM(require_peg());

// src/dsl/grammar-source.ts
var GRAMMAR_SOURCE = `
/**
 * PEG Grammar for the Travel Policy DSL
 */

{{
function buildLogicalTree(head, tail) {
  return tail.reduce((left, [, , op, , right]) => ({
    type: 'logical',
    operator: op,
    left,
    right,
    location: location()
  }), head);
}
}}

// --- Document ---

PolicyDocument
  = _ rules:Rule+ _ {
      return { type: 'document', rules };
    }

// --- Rule ---

Rule
  = _ "rule" __ name:StringLiteral _ priority:Priority? _
    "when" _ conditions:ConditionBlock _
    "then" _ actions:ActionBlock _ {
      return {
        type: 'rule',
        name,
        priority,
        conditions,
        actions,
        location: location()
      };
    }

Priority
  = "priority" __ value:Integer {
      return value;
    }

// --- Condition Block ---

ConditionBlock
  = head:ConditionOr {
      return head;
    }

ConditionOr
  = head:ConditionAnd tail:(_ "OR" _ ConditionAnd)* {
      return tail.length === 0 ? head : tail.reduce((left, [, op, , right]) => ({
        type: 'logical',
        operator: 'OR',
        left,
        right,
        location: location()
      }), head);
    }

ConditionAnd
  = head:ConditionUnary tail:(_ "AND" _ ConditionUnary)* {
      return tail.length === 0 ? head : tail.reduce((left, [, op, , right]) => ({
        type: 'logical',
        operator: 'AND',
        left,
        right,
        location: location()
      }), head);
    }

ConditionUnary
  = "NOT" _ "(" _ expr:ConditionBlock _ ")" {
      return {
        type: 'not',
        expression: expr,
        location: location()
      };
    }
  / "(" _ expr:ConditionBlock _ ")" {
      return {
        type: 'grouped',
        expression: expr,
        location: location()
      };
    }
  / Comparison

// --- Comparison ---

Comparison
  = field:FieldRef _ op:BetweenOp _ low:Value _ "and" _ high:Value {
      return {
        type: 'comparison',
        field,
        operator: op,
        value: { type: 'between', low, high },
        location: location()
      };
    }
  / field:FieldRef _ op:ComparisonOp _ value:Value {
      return {
        type: 'comparison',
        field,
        operator: op,
        value,
        location: location()
      };
    }

FieldRef
  = head:Identifier tail:("." Identifier)* {
      return [head, ...tail.map(t => t[1])].join('.');
    }

BetweenOp
  = "between" { return 'between'; }

ComparisonOp
  = "==" { return '=='; }
  / "!=" { return '!='; }
  / ">=" { return '>='; }
  / "<=" { return '<='; }
  / ">" { return '>'; }
  / "<" { return '<'; }
  / "not in" { return 'not in'; }
  / "in" { return 'in'; }
  / "contains" { return 'contains'; }
  / "matches" { return 'matches'; }

// --- Action Block ---

ActionBlock
  = head:Action tail:(_ Action)* {
      return [head, ...tail.map(t => t[1])];
    }

Action
  = ApproveAction
  / RejectAction
  / WarnAction
  / SuggestAction
  / ObligationAction

ApproveAction
  = "approve" !IdentifierChar {
      return { type: 'approve', location: location() };
    }

RejectAction
  = "reject" __ "with" __ "reason" __ reason:StringLiteral {
      return { type: 'reject', reason, location: location() };
    }

WarnAction
  = "warn" __ message:StringLiteral {
      return { type: 'warn', message, location: location() };
    }

SuggestAction
  = "suggest" __ "alternative" __ "where" __ condition:Comparison {
      return { type: 'suggest', condition, location: location() };
    }

ObligationAction
  = "require" __ obligation:ObligationType {
      return { type: 'obligation', obligation, location: location() };
    }

ObligationType
  = "manager_approval" { return 'manager_approval'; }
  / "finance_approval" { return 'finance_approval'; }
  / "justification" { return 'justification'; }
  / "approval" { return 'approval'; }

// --- Values ---

Value
  = DateLiteral
  / ArrayLiteral
  / StringLiteral_
  / NumberLiteral
  / BooleanLiteral

StringLiteral
  = '"' chars:DoubleStringChar* '"' {
      return chars.join('');
    }

StringLiteral_
  = '"' chars:DoubleStringChar* '"' {
      return { type: 'string', value: chars.join('') };
    }

DoubleStringChar
  = '\\\\' char:EscapeChar { return char; }
  / [^"\\\\]

EscapeChar
  = '"' { return '"'; }
  / '\\\\' { return '\\\\'; }
  / 'n' { return '\\n'; }
  / 't' { return '\\t'; }
  / 'r' { return '\\r'; }

NumberLiteral
  = sign:"-"? digits:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = (sign || '') + digits.join('') + (decimal ? '.' + decimal[1].join('') : '');
      return { type: 'number', value: parseFloat(numStr) };
    }

BooleanLiteral
  = "true" !IdentifierChar { return { type: 'boolean', value: true }; }
  / "false" !IdentifierChar { return { type: 'boolean', value: false }; }

ArrayLiteral
  = "[" _ head:Value tail:(_ "," _ Value)* _ "]" {
      return { type: 'array', elements: [head, ...tail.map(t => t[3])] };
    }
  / "[" _ "]" {
      return { type: 'array', elements: [] };
    }

DateLiteral
  = "@" year:$([0-9][0-9][0-9][0-9]) "-" month:$([0-9][0-9]) "-" day:$([0-9][0-9]) time:("T" $([0-9][0-9] ":" [0-9][0-9] (":" [0-9][0-9])?))? {
      const dateStr = year + '-' + month + '-' + day + (time ? 'T' + time[1] : '');
      return { type: 'date', value: dateStr };
    }

Integer
  = digits:[0-9]+ {
      return parseInt(digits.join(''), 10);
    }

Identifier
  = head:[a-zA-Z_] tail:[a-zA-Z0-9_]* {
      return head + tail.join('');
    }

IdentifierChar
  = [a-zA-Z0-9_]

// --- Whitespace and Comments ---

_  "whitespace"
  = (WhitespaceChar / Comment)*

__ "mandatory whitespace"
  = (WhitespaceChar / Comment)+

WhitespaceChar
  = [ \\t\\n\\r]

Comment
  = "//" [^\\n\\r]* [\\n\\r]?
`;

// src/dsl/parser.ts
var cachedParser = null;
function getParser() {
  if (cachedParser) {
    return cachedParser;
  }
  cachedParser = peggy.generate(GRAMMAR_SOURCE, {
    output: "parser",
    allowedStartRules: ["PolicyDocument"]
  });
  return cachedParser;
}
function parse(dslSource) {
  const parser = getParser();
  try {
    const result = parser.parse(dslSource);
    return result;
  } catch (error) {
    if (isPeggyError(error)) {
      const parseError = {
        message: error.message,
        line: error.location?.start?.line ?? 0,
        column: error.location?.start?.column ?? 0,
        offset: error.location?.start?.offset ?? 0,
        expected: error.expected ? error.expected.map((e) => formatExpectation(e)) : [],
        found: error.found ?? null
      };
      throw new DSLParseError(parseError);
    }
    throw error;
  }
}
var DSLParseError = class extends Error {
  line;
  column;
  offset;
  expected;
  found;
  constructor(parseError) {
    const locationInfo = `line ${parseError.line}, column ${parseError.column}`;
    const expectedInfo = parseError.expected.length > 0 ? `, expected: ${parseError.expected.join(", ")}` : "";
    const foundInfo = parseError.found !== null ? `, found: ${JSON.stringify(parseError.found)}` : "";
    super(`Parse error at ${locationInfo}${expectedInfo}${foundInfo}`);
    this.name = "DSLParseError";
    this.line = parseError.line;
    this.column = parseError.column;
    this.offset = parseError.offset;
    this.expected = parseError.expected;
    this.found = parseError.found;
  }
  toJSON() {
    return {
      message: this.message,
      line: this.line,
      column: this.column,
      offset: this.offset,
      expected: this.expected,
      found: this.found
    };
  }
};
function isPeggyError(error) {
  return error !== null && typeof error === "object" && "message" in error && ("location" in error || "expected" in error);
}
function formatExpectation(exp) {
  if (exp.description) {
    return exp.description;
  }
  if (exp.text) {
    return JSON.stringify(exp.text);
  }
  switch (exp.type) {
    case "end":
      return "end of input";
    case "other":
      return exp.description || "unknown";
    case "literal":
      return JSON.stringify(exp.text);
    case "class":
      return exp.description || "character class";
    default:
      return exp.type;
  }
}

// src/dsl/compiler.ts
var import_crypto = require("crypto");
var VALID_FIELD_PREFIXES = ["traveller", "trip", "offer"];
var NUMERIC_OPERATORS = [">", ">=", "<", "<=", "between"];
var ARRAY_OPERATORS = ["in", "not in"];
function compile(document) {
  const errors = [];
  const warnings = [];
  for (const rule of document.rules) {
    validateRule(rule, errors, warnings);
  }
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings: warnings.length > 0 ? warnings : void 0
    };
  }
  const nodes = [];
  const edges = [];
  const ruleMetadata = [];
  const rootNodeId = generateNodeId();
  const rootNode = {
    nodeId: rootNodeId,
    type: "gate",
    operator: "or"
  };
  nodes.push(rootNode);
  for (let i = 0; i < document.rules.length; i++) {
    const rule = document.rules[i];
    const ruleEntryNodeId = compileRule(rule, nodes, edges);
    ruleMetadata.push({
      name: rule.name,
      priority: rule.priority,
      entryNodeId: ruleEntryNodeId
    });
    edges.push({
      fromNodeId: rootNodeId,
      toNodeId: ruleEntryNodeId,
      condition: "default",
      priority: rule.priority ?? i
    });
  }
  const graph = {
    graphId: (0, import_crypto.randomUUID)(),
    version: 1,
    rootNodeId,
    nodes,
    edges,
    metadata: buildMetadata(document, ruleMetadata)
  };
  return {
    success: true,
    policyGraph: graph,
    warnings: warnings.length > 0 ? warnings : void 0
  };
}
function compileRule(rule, nodes, edges) {
  const conditionEntryId = compileConditionExpression(rule.conditions, nodes, edges);
  const terminalNodeId = compileActions(rule, nodes, edges);
  edges.push({
    fromNodeId: conditionEntryId,
    toNodeId: terminalNodeId,
    condition: "true"
  });
  return conditionEntryId;
}
function compileConditionExpression(expr, nodes, edges) {
  switch (expr.type) {
    case "comparison":
      return compileComparison(expr, nodes);
    case "logical":
      return compileLogical(expr, nodes, edges);
    case "not":
      return compileNot(expr, nodes, edges);
    case "grouped":
      return compileConditionExpression(expr.expression, nodes, edges);
  }
}
function compileComparison(expr, nodes) {
  const nodeId = generateNodeId();
  const node = {
    nodeId,
    type: "condition",
    condition: {
      field: expr.field,
      operator: mapComparisonOperator(expr.operator),
      value: extractValue(expr.value),
      valueType: "literal"
    }
  };
  nodes.push(node);
  return nodeId;
}
function compileLogical(expr, nodes, edges) {
  const gateNodeId = generateNodeId();
  const gateNode = {
    nodeId: gateNodeId,
    type: "gate",
    operator: expr.operator.toLowerCase()
  };
  nodes.push(gateNode);
  const leftId = compileConditionExpression(expr.left, nodes, edges);
  const rightId = compileConditionExpression(expr.right, nodes, edges);
  edges.push({
    fromNodeId: gateNodeId,
    toNodeId: leftId,
    condition: "default",
    priority: 0
  });
  edges.push({
    fromNodeId: gateNodeId,
    toNodeId: rightId,
    condition: "default",
    priority: 1
  });
  return gateNodeId;
}
function compileNot(expr, nodes, edges) {
  const gateNodeId = generateNodeId();
  const gateNode = {
    nodeId: gateNodeId,
    type: "gate",
    operator: "not"
  };
  nodes.push(gateNode);
  const innerNodeId = compileConditionExpression(expr.expression, nodes, edges);
  edges.push({
    fromNodeId: gateNodeId,
    toNodeId: innerNodeId,
    condition: "default"
  });
  return gateNodeId;
}
function compileActions(rule, nodes, edges) {
  const actionNodeIds = [];
  for (const action of rule.actions) {
    const actionNode = compileActionNode(action);
    if (actionNode) {
      nodes.push(actionNode);
      actionNodeIds.push(actionNode.nodeId);
    }
  }
  const terminalNodeId = generateNodeId();
  const terminal = buildTerminal(rule.actions);
  const terminalNode = {
    nodeId: terminalNodeId,
    type: "terminal",
    terminal
  };
  nodes.push(terminalNode);
  if (actionNodeIds.length > 0) {
    for (let i = 0; i < actionNodeIds.length - 1; i++) {
      edges.push({
        fromNodeId: actionNodeIds[i],
        toNodeId: actionNodeIds[i + 1],
        condition: "default"
      });
    }
    edges.push({
      fromNodeId: actionNodeIds[actionNodeIds.length - 1],
      toNodeId: terminalNodeId,
      condition: "default"
    });
    return actionNodeIds[0];
  }
  return terminalNodeId;
}
function compileActionNode(action) {
  const nodeId = generateNodeId();
  switch (action.type) {
    case "approve":
      return null;
    case "reject":
      return null;
    case "warn":
      return {
        nodeId,
        type: "action",
        action: {
          type: "warn",
          params: { message: action.message }
        }
      };
    case "suggest":
      return {
        nodeId,
        type: "action",
        action: {
          type: "suggest_alternative",
          params: {
            field: action.condition.field,
            operator: mapComparisonOperator(action.condition.operator),
            value: extractValue(action.condition.value)
          }
        }
      };
    case "obligation":
      return {
        nodeId,
        type: "action",
        action: {
          type: "add_obligation",
          params: { obligationType: mapObligationType(action.obligation) }
        }
      };
  }
}
function buildTerminal(actions) {
  let result = "approve";
  const reasons = [];
  const obligations = [];
  for (const action of actions) {
    switch (action.type) {
      case "approve":
        result = "approve";
        break;
      case "reject":
        result = "reject";
        reasons.push(action.reason);
        break;
      case "obligation":
        if (result === "approve") {
          result = "review";
        }
        obligations.push({
          type: mapObligationType(action.obligation),
          description: `Requires ${action.obligation.replace("_", " ")}`
        });
        break;
      case "warn":
        reasons.push(action.message);
        break;
    }
  }
  return { result, reasons, obligations };
}
function validateRule(rule, errors, warnings) {
  validateConditionExpression(rule.conditions, errors, warnings);
  validateActions(rule.actions, errors, warnings);
}
function validateConditionExpression(expr, errors, warnings) {
  switch (expr.type) {
    case "comparison":
      validateComparison(expr, errors, warnings);
      break;
    case "logical":
      validateConditionExpression(expr.left, errors, warnings);
      validateConditionExpression(expr.right, errors, warnings);
      break;
    case "not":
      validateConditionExpression(expr.expression, errors, warnings);
      break;
    case "grouped":
      validateConditionExpression(expr.expression, errors, warnings);
      break;
  }
}
function validateComparison(expr, errors, _warnings) {
  validateFieldReference(expr.field, expr.location, errors);
  validateOperatorValueCompatibility(expr, errors);
}
function validateFieldReference(field, location, errors) {
  const prefix = field.split(".")[0];
  if (!field.includes(".")) {
    return;
  }
  if (!VALID_FIELD_PREFIXES.includes(prefix)) {
    errors.push({
      type: "semantic",
      message: `Invalid field reference "${field}": unknown prefix "${prefix}". Valid prefixes are: ${VALID_FIELD_PREFIXES.join(", ")}`,
      line: location.start.line,
      column: location.start.column
    });
  }
}
function validateOperatorValueCompatibility(expr, errors) {
  const { operator, value, location } = expr;
  if (NUMERIC_OPERATORS.includes(operator)) {
    if (operator === "between") {
      if (value.type !== "between") {
        errors.push({
          type: "semantic",
          message: `Operator "between" requires a range value (low and high), got "${value.type}"`,
          line: location.start.line,
          column: location.start.column
        });
      }
    } else if (value.type !== "number" && value.type !== "date") {
      errors.push({
        type: "semantic",
        message: `Operator "${operator}" requires a numeric or date value, got "${value.type}"`,
        line: location.start.line,
        column: location.start.column
      });
    }
  }
  if (ARRAY_OPERATORS.includes(operator)) {
    if (value.type !== "array") {
      errors.push({
        type: "semantic",
        message: `Operator "${operator}" requires an array value, got "${value.type}"`,
        line: location.start.line,
        column: location.start.column
      });
    }
  }
}
function validateActions(actions, _errors, warnings) {
  const hasApprove = actions.some((a) => a.type === "approve");
  const hasReject = actions.some((a) => a.type === "reject");
  if (hasApprove && hasReject) {
    const rejectAction = actions.find((a) => a.type === "reject");
    warnings.push({
      type: "conflicting_actions",
      message: 'Rule contains both "approve" and "reject" actions; "reject" will take precedence',
      line: rejectAction.location.start.line,
      column: rejectAction.location.start.column
    });
  }
}
function mapComparisonOperator(op) {
  const mapping = {
    "==": "eq",
    "!=": "neq",
    ">": "gt",
    ">=": "gte",
    "<": "lt",
    "<=": "lte",
    "in": "in",
    "not in": "not_in",
    "contains": "contains",
    "matches": "matches",
    "between": "between"
  };
  return mapping[op];
}
function mapObligationType(obligation) {
  const mapping = {
    "approval": "require_approval",
    "justification": "require_justification",
    "manager_approval": "manager_approval",
    "finance_approval": "finance_approval"
  };
  return mapping[obligation];
}
function extractValue(node) {
  switch (node.type) {
    case "string":
    case "number":
    case "boolean":
    case "date":
      return node.value;
    case "array":
      return node.elements.map((el) => extractValue(el));
    case "between":
      return { low: extractValue(node.low), high: extractValue(node.high) };
  }
}
function generateNodeId() {
  return (0, import_crypto.randomUUID)();
}
function buildMetadata(document, rules) {
  return {
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    compiledFrom: `dsl:${document.rules.length}-rules`,
    checksum: generateChecksum(document),
    rules
  };
}
function generateChecksum(document) {
  const content = JSON.stringify(document);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// src/lib/database.ts
var import_client_secrets_manager = require("@aws-sdk/client-secrets-manager");
var secretsClient = new import_client_secrets_manager.SecretsManagerClient({});
var cachedCredentials = null;
var credentialsCacheExpiry = 0;
var CREDENTIALS_CACHE_TTL_MS = 5 * 60 * 1e3;
async function getDatabaseCredentials() {
  const now = Date.now();
  if (cachedCredentials && now < credentialsCacheExpiry) {
    return cachedCredentials;
  }
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error("DB_SECRET_ARN environment variable is not set");
  }
  const response = await secretsClient.send(
    new import_client_secrets_manager.GetSecretValueCommand({ SecretId: secretArn })
  );
  if (!response.SecretString) {
    throw new Error("Database secret has no string value");
  }
  const secret = JSON.parse(response.SecretString);
  cachedCredentials = secret;
  credentialsCacheExpiry = now + CREDENTIALS_CACHE_TTL_MS;
  return secret;
}
async function createDatabaseClient() {
  const credentials = await getDatabaseCredentials();
  const { Client: Client2 } = await Promise.resolve().then(() => (init_esm(), esm_exports));
  const client = new Client2({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: credentials.dbname,
    ssl: process.env.DB_SSL_ENABLED !== "false" ? { rejectUnauthorized: false } : void 0
  });
  await client.connect();
  return {
    async query(sql, params) {
      const result = await client.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0
      };
    },
    async end() {
      await client.end();
    }
  };
}
async function withDatabase(fn) {
  const client = await createDatabaseClient();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// src/handlers/shared.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Tenant-Id",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Content-Type": "application/json"
};
function extractTenantId(event) {
  const headerTenantId = event.headers?.["x-tenant-id"] ?? event.headers?.["X-Tenant-Id"];
  if (headerTenantId) {
    return headerTenantId;
  }
  const authContext = event.requestContext?.authorizer;
  if (authContext && typeof authContext === "object" && "tenantId" in authContext) {
    return authContext.tenantId;
  }
  return null;
}
function extractUserId(event) {
  const authContext = event.requestContext?.authorizer;
  if (authContext && typeof authContext === "object" && "userId" in authContext) {
    return authContext.userId;
  }
  return event.requestContext?.authorizer?.claims?.sub ?? "system";
}
function successResponse(statusCode, data, requestId) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      data,
      metadata: {
        requestId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        version: "v1"
      }
    })
  };
}
function errorResponse(statusCode, code, message, requestId) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      code,
      message,
      requestId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    })
  };
}

// src/handlers/update-rule.ts
async function handler(event, _context) {
  const requestId = _context.awsRequestId;
  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, "MISSING_TENANT", "Tenant ID is required", requestId);
    }
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return errorResponse(400, "MISSING_RULE_ID", "ruleId path parameter is required", requestId);
    }
    if (!event.body) {
      return errorResponse(400, "MISSING_BODY", "Request body is required", requestId);
    }
    const body = JSON.parse(event.body);
    const { name, description, dslSource, priority, status } = body;
    const schemaName = `tenant_${tenantId.replace(/-/g, "_")}`;
    const userId = extractUserId(event);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let policyGraph = null;
    if (dslSource) {
      try {
        const ast2 = parse(dslSource);
        const compilationResult = compile(ast2);
        if (!compilationResult.success || !compilationResult.policyGraph) {
          return errorResponse(
            400,
            "DSL_COMPILATION_ERROR",
            `DSL compilation failed: ${compilationResult.errors?.map((e) => e.message).join("; ") ?? "Unknown error"}`,
            requestId
          );
        }
        policyGraph = compilationResult.policyGraph;
      } catch (parseError) {
        return errorResponse(400, "DSL_PARSE_ERROR", `DSL parse error: ${parseError.message}`, requestId);
      }
    }
    const updatedRule = await withDatabase(async (db) => {
      const setClauses = ["updated_at = $2"];
      const values = [ruleId, now];
      let paramIndex = 3;
      if (name !== void 0) {
        setClauses.push(`name = $${paramIndex}`);
        values.push(name);
        paramIndex++;
      }
      if (description !== void 0) {
        setClauses.push(`description = $${paramIndex}`);
        values.push(description);
        paramIndex++;
      }
      if (dslSource !== void 0) {
        setClauses.push(`dsl_source = $${paramIndex}`);
        values.push(dslSource);
        paramIndex++;
      }
      if (policyGraph) {
        setClauses.push(`policy_graph = $${paramIndex}`);
        values.push(JSON.stringify(policyGraph));
        paramIndex++;
      }
      if (priority !== void 0) {
        setClauses.push(`priority = $${paramIndex}`);
        values.push(priority);
        paramIndex++;
      }
      if (status !== void 0) {
        setClauses.push(`status = $${paramIndex}`);
        values.push(status);
        paramIndex++;
      }
      const result = await db.query(
        `UPDATE ${schemaName}.policy_rules SET ${setClauses.join(", ")} WHERE rule_id = $1 RETURNING *`,
        values
      );
      if (result.rows.length === 0) return null;
      return result.rows[0];
    });
    if (!updatedRule) {
      return errorResponse(404, "RULE_NOT_FOUND", `Rule ${ruleId} not found`, requestId);
    }
    return successResponse(200, {
      ruleId: updatedRule.rule_id,
      name: updatedRule.name,
      description: updatedRule.description,
      dslSource: updatedRule.dsl_source,
      status: updatedRule.status,
      version: updatedRule.version,
      priority: updatedRule.priority,
      updatedAt: updatedRule.updated_at
    }, requestId);
  } catch (error) {
    console.error("Update rule failed:", error);
    return errorResponse(500, "UPDATE_RULE_FAILED", error instanceof Error ? error.message : "An unexpected error occurred", requestId);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=update-rule.js.map
