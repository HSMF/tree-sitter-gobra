/**
 * @file Gobra grammar for tree-sitter
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @author Amaan Qureshi <amaanq12@gmail.com>
 * @author Conradin Laux <conradinlaux@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  primary: 13,
  unary: 12,
  multiplicative: 11,
  additive: 10,
  set_operations: 9,
  set_comparison: 8,
  comparative: 7,
  impl: 6,
  and: 5,
  or: 4,
  implies: 3,
  qmark: 2,
  unfolding: 1,
  composite_literal: -1,
};

const multiplicativeOperators = ["*", "/", "%", "<<", ">>", "&", "&^", "--*"];
const additiveOperators = ["+", "-", "|", "^"];
const comparativeOperators = ["==", "!=", "<", "<=", ">", ">=", "===", "!=="];
const assignmentOperators = multiplicativeOperators
  .concat(additiveOperators)
  .map((operator) => operator + "=")
  .concat("=");
const setOperators = ["union", "setminus", "intersection"];
const setComparisonOperators = ["in", "#", "subset"];

const newline = "\n";
const terminator = choice(newline, ";", "\0");

const hexDigit = /[0-9a-fA-F]/;
const octalDigit = /[0-7]/;
const decimalDigit = /[0-9]/;
const binaryDigit = /[01]/;

const hexDigits = seq(hexDigit, repeat(seq(optional("_"), hexDigit)));
const octalDigits = seq(octalDigit, repeat(seq(optional("_"), octalDigit)));
const decimalDigits = seq(
  decimalDigit,
  repeat(seq(optional("_"), decimalDigit)),
);
const binaryDigits = seq(binaryDigit, repeat(seq(optional("_"), binaryDigit)));

const hexLiteral = seq("0", choice("x", "X"), optional("_"), hexDigits);
const octalLiteral = seq(
  "0",
  optional(choice("o", "O")),
  optional("_"),
  octalDigits,
);
const decimalLiteral = choice(
  "0",
  seq(/[1-9]/, optional(seq(optional("_"), decimalDigits))),
);
const binaryLiteral = seq("0", choice("b", "B"), optional("_"), binaryDigits);

const intLiteral = choice(
  binaryLiteral,
  decimalLiteral,
  octalLiteral,
  hexLiteral,
);

const decimalExponent = seq(
  choice("e", "E"),
  optional(choice("+", "-")),
  decimalDigits,
);
const decimalFloatLiteral = choice(
  seq(decimalDigits, ".", optional(decimalDigits), optional(decimalExponent)),
  seq(decimalDigits, decimalExponent),
  seq(".", decimalDigits, optional(decimalExponent)),
);

const hexExponent = seq(
  choice("p", "P"),
  optional(choice("+", "-")),
  decimalDigits,
);
const hexMantissa = choice(
  seq(optional("_"), hexDigits, ".", optional(hexDigits)),
  seq(optional("_"), hexDigits),
  seq(".", hexDigits),
);
const hexFloatLiteral = seq("0", choice("x", "X"), hexMantissa, hexExponent);

const floatLiteral = choice(decimalFloatLiteral, hexFloatLiteral);

const imaginaryLiteral = seq(
  choice(decimalDigits, intLiteral, floatLiteral),
  "i",
);

module.exports = grammar({
  name: "gobra",

  extras: ($) => [$.comment, /\s/],

  inline: ($) => [
    $._type,
    $._type_identifier,
    $._field_identifier,
    $._package_identifier,
    $._top_level_declaration,
    $._string_literal,
    $._interface_elem,
  ],

  word: ($) => $.identifier,

  conflicts: ($) => [
    [$._simple_type, $._primary_expr],
    [$._simple_type, $.generic_type, $._primary_expr],
    [$.qualified_type, $._primary_expr],
    [$.qualified_type, $._primary_expr, $._simple_type],
    [$.qualified_type, $._simple_type],
    [$.generic_type, $._simple_type],
    [$.parameter_declaration, $._simple_type],
    [$.type_parameter_declaration, $._simple_type, $._primary_expr],
    [$.type_parameter_declaration, $._primary_expr],
    [
      $.type_parameter_declaration,
      $._simple_type,
      $.generic_type,
      $._primary_expr,
    ],
    [$._spec_statement, $.loop_spec],
    [$.package_clause, $._primary_expr],
    [$.call_expression],
  ],

  supertypes: ($) => [
    $._expression,
    $._type,
    $._simple_type,
    $._statement,
    $._simple_statement,
  ],

  rules: {
    source_file: ($) =>
      seq(
        repeat(seq($._init_post, terminator)),
        repeat(
          choice(
            // Unlike a Go compiler, we accept statements at top-level to enable
            // parsing of partial code snippets in documentation (see #63).
            seq($._statement, terminator),
            seq($._top_level_declaration, terminator),
            // we accept the following constructs at top-level to enable highlighting inline comments in .go files
            seq($._range_with, terminator),
            seq(",", $._expression, terminator),
          ),
        ),
        optional($._top_level_declaration),
      ),

    _init_post: ($) => seq("initEnsures", $._expression),
    _import_pre: ($) => seq("IMPORT_PRE", $._expression),

    _specification: ($) =>
      seq(
        repeat1(
          seq(
            choice($._spec_statement, "opaque", "pure", "trusted"),
            terminator,
          ),
        ),
        prec.right(optional("pure")),
      ),

    _spec_statement: ($) =>
      choice(
        $.pre_condition,
        $.post_condition,
        $.preserves_condition,
        $.termination_condition,
      ),
    pre_condition: ($) => seq("requires", $.assertion),
    preserves_condition: ($) => seq("preserves", $.assertion),
    post_condition: ($) => seq("ensures", $.assertion),
    termination_condition: ($) =>
      seq("decreases", optional($.termination_measure)),

    termination_measure: ($) =>
      choice(
        $.expression_list,
        seq("if", $._expression),
        seq($.expression_list, "if", $._expression),
      ),

    assertion: ($) => $._expression,

    _top_level_declaration: ($) =>
      choice(
        $.package_clause,
        $.function_declaration,
        $.method_declaration,
        $.import_declaration,
        $.ghost_member,
        // add the specification as a top level declaration for //@ comments
        $._specification,
        $.outline_statement,
      ),

    package_clause: ($) => seq("package", $._package_identifier),

    import_declaration: ($) =>
      seq("import", choice($.import_spec, $.import_spec_list)),

    import_spec: ($) =>
      seq(
        repeat(seq($._import_pre, terminator)),
        optional(
          field(
            "name",
            choice($.dot, $.blank_identifier, $._package_identifier),
          ),
        ),
        field("path", $._string_literal),
      ),
    dot: (_) => ".",
    blank_identifier: (_) => "_",

    import_spec_list: ($) =>
      seq(
        "(",
        optional(
          seq(
            $.import_spec,
            repeat(seq(terminator, $.import_spec)),
            optional(terminator),
          ),
        ),
        ")",
      ),

    ghost_member: ($) =>
      choice(
        $.implementation_proof,
        $.fpredicate_decl,
        $.mpredicate_decl,
        $._explicit_ghost_member,
      ),

    _explicit_ghost_member: ($) =>
      seq(
        "ghost",
        choice(
          $.function_declaration,
          $.method_declaration,
          // TODO: declaration
        ),
      ),

    implementation_proof: ($) =>
      seq(
        $._type,
        "implements",
        $._type,
        optional($._implementation_proof_body),
      ),
    _implementation_proof_body: ($) =>
      seq(
        "{",
        repeat(seq($.implementation_proof_predicate_alias, terminator)),
        // TODO: repeat(seq($.method_implementation_proof, terminator)),
        "}",
      ),
    implementation_proof_predicate_alias: ($) =>
      seq(
        "pred",
        $.identifier,
        ":=",
        choice($._expression, seq($._type, ".", $.identifier)),
      ),

    fpredicate_decl: ($) =>
      seq(
        "pred",
        field("name", $.identifier),
        field("parameters", $.parameter_list),
        optional($.predicate_body),
      ),

    predicate_body: ($) => seq("{", $._expression, terminator, "}"),

    mpredicate_decl: ($) =>
      seq(
        "pred",
        field("receiver", $.parameter_list),
        field("name", $.identifier),
        field("parameters", $.parameter_list),
        optional($.predicate_body),
      ),

    _declaration: ($) =>
      choice($.const_declaration, $.type_declaration, $.var_declaration),

    const_declaration: ($) =>
      seq(
        "const",
        choice(
          $.const_spec,
          seq("(", repeat(seq($.const_spec, terminator)), ")"),
        ),
      ),

    const_spec: ($) =>
      prec.left(
        seq(
          field("name", commaSep1($.identifier)),
          optional(
            seq(
              optional(field("type", $._type)),
              "=",
              field("value", $.expression_list),
            ),
          ),
        ),
      ),

    var_declaration: ($) =>
      seq(
        "var",
        choice($.var_spec, seq("(", repeat(seq($.var_spec, terminator)), ")")),
      ),

    var_spec: ($) =>
      seq(
        field("name", commaSep1($.identifier)),
        choice(
          seq(
            field("type", $._type),
            optional(seq("=", field("value", $.expression_list))),
          ),
          seq("=", field("value", $.expression_list)),
        ),
      ),

    function_declaration: ($) =>
      seq(optional($._specification), $._function_declaration),

    _function_declaration: ($) =>
      prec.right(
        1,
        seq(
          "func",
          field("name", $.identifier),
          field("type_parameters", optional($.type_parameter_list)),
          field("parameters", $.parameter_list),
          field("result", optional(choice($.parameter_list, $._simple_type))),
          field("body", optional($.block)),
        ),
      ),

    method_declaration: ($) =>
      prec.right(
        1,
        seq(
          "func",
          field("receiver", $.parameter_list),
          field("name", $._field_identifier),
          field("parameters", $.parameter_list),
          field("result", optional(choice($.parameter_list, $._simple_type))),
          field("body", optional($.block)),
        ),
      ),

    type_parameter_list: ($) =>
      seq("[", commaSep1($.type_parameter_declaration), optional(","), "]"),

    type_parameter_declaration: ($) =>
      seq(
        commaSep1(field("name", $.identifier)),
        field("type", alias($.type_elem, $.type_constraint)),
      ),

    parameter_list: ($) =>
      seq(
        "(",
        optional(
          seq(
            commaSep(
              choice($.parameter_declaration, $.variadic_parameter_declaration),
            ),
            optional(","),
          ),
        ),
        ")",
      ),

    parameter_declaration: ($) =>
      prec.left(
        seq(
          optional("ghost"),
          commaSep(field("name", $.identifier)),
          field("type", $._type),
        ),
      ),

    variadic_parameter_declaration: ($) =>
      seq(field("name", optional($.identifier)), "...", field("type", $._type)),

    type_alias: ($) =>
      seq(field("name", $._type_identifier), "=", field("type", $._type)),

    type_declaration: ($) =>
      seq(
        "type",
        choice(
          $.type_spec,
          $.type_alias,
          seq(
            "(",
            repeat(seq(choice($.type_spec, $.type_alias), terminator)),
            ")",
          ),
        ),
      ),

    type_spec: ($) =>
      seq(
        field("name", $._type_identifier),
        field("type_parameters", optional($.type_parameter_list)),
        field("type", $._type),
      ),

    field_name_list: ($) => commaSep1($._field_identifier),

    expression_list: ($) => commaSep1($._expression),

    _type: ($) => choice($._simple_type, $.parenthesized_type),

    parenthesized_type: ($) => seq("(", $._type, ")"),

    _simple_type: ($) =>
      choice(
        prec.dynamic(-1, $._type_identifier),
        $.generic_type,
        $.qualified_type,
        $.pointer_type,
        $.struct_type,
        $.adt_type,
        $.interface_type,
        $.array_type,
        $.slice_type,
        $.map_type,
        $.channel_type,
        $.function_type,
        $.negated_type,
      ),

    generic_type: ($) =>
      prec.dynamic(
        1,
        seq(
          field(
            "type",
            choice($._type_identifier, $.qualified_type, $.negated_type),
          ),
          field("type_arguments", $.type_arguments),
        ),
      ),

    type_arguments: ($) =>
      prec.dynamic(2, seq("[", commaSep1($.type_elem), optional(","), "]")),

    pointer_type: ($) => prec(PREC.unary, seq("*", $._type)),

    array_type: ($) =>
      prec.right(
        seq(
          "[",
          field("length", $._expression),
          "]",
          field("element", $._type),
        ),
      ),

    implicit_length_array_type: ($) =>
      seq("[", "...", "]", field("element", $._type)),

    slice_type: ($) => prec.right(seq("[", "]", field("element", $._type))),

    struct_type: ($) => seq("struct", $.field_declaration_list),

    adt_type: ($) => seq("adt", $.adt_clauses),

    adt_clauses: ($) =>
      seq(
        "{",
        optional(
          seq(
            $.adt_clause,
            repeat(seq(terminator, $.field_declaration)),
            optional(terminator),
          ),
        ),
        "}",
      ),
    adt_clause: ($) =>
      seq(field("variant", $.identifier), $.field_declaration_list),

    negated_type: ($) => prec.left(seq("~", $._type)),

    field_declaration_list: ($) =>
      seq(
        "{",
        optional(
          seq(
            $.field_declaration,
            repeat(seq(terminator, $.field_declaration)),
            optional(terminator),
          ),
        ),
        "}",
      ),

    field_declaration: ($) =>
      seq(
        choice(
          seq(
            commaSep1(field("name", $._field_identifier)),
            field("type", $._type),
          ),
          seq(
            optional("*"),
            field(
              "type",
              choice($._type_identifier, $.qualified_type, $.generic_type),
            ),
          ),
        ),
        field("tag", optional($._string_literal)),
      ),

    interface_type: ($) =>
      seq(
        "interface",
        "{",
        optional(
          seq(
            $._interface_elem,
            repeat(seq(terminator, $._interface_elem)),
            optional(terminator),
          ),
        ),
        "}",
      ),

    _interface_elem: ($) => choice($.method_elem, $.type_elem),

    method_elem: ($) =>
      seq(
        field("name", $._field_identifier),
        field("parameters", $.parameter_list),
        field("result", optional(choice($.parameter_list, $._simple_type))),
      ),

    type_elem: ($) => sep1($._type, "|"),

    map_type: ($) =>
      prec.right(
        seq("map", "[", field("key", $._type), "]", field("value", $._type)),
      ),

    channel_type: ($) =>
      prec.left(
        choice(
          seq("chan", field("value", $._type)),
          seq("chan", "<-", field("value", $._type)),
          prec(PREC.unary, seq("<-", "chan", field("value", $._type))),
        ),
      ),

    function_type: ($) =>
      prec.right(
        seq(
          "func",
          field("parameters", $.parameter_list),
          field("result", optional(choice($.parameter_list, $._simple_type))),
        ),
      ),

    block: ($) => seq("{", optional($._statement_list), "}"),

    _statement_list: ($) =>
      choice(
        seq(
          $._statement,
          repeat(seq(terminator, $._statement)),
          optional(
            seq(
              terminator,
              optional(alias($.empty_labeled_statement, $.labeled_statement)),
            ),
          ),
        ),
        alias($.empty_labeled_statement, $.labeled_statement),
      ),

    _statement: ($) =>
      choice(
        $._declaration,
        $.auxiliary_statement,
        $._simple_statement,
        $.return_statement,
        $.go_statement,
        $.defer_statement,
        $.if_statement,
        $.spec_for_statement,
        $.expression_switch_statement,
        $.type_switch_statement,
        $.select_statement,
        $.labeled_statement,
        $.fallthrough_statement,
        $.break_statement,
        $.continue_statement,
        $.goto_statement,
        $.block,
        $.empty_statement,
        $.ghost_statement,
        $.package_statement,
        $.apply_statement,
      ),

    empty_statement: (_) => ";",

    _proof_statement: ($) =>
      seq(choice("assume", "assert", "inhale", "exhale"), $._expression),

    ghost_statement: ($) =>
      choice(
        seq("ghost", $._statement),
        seq(choice("fold", "unfold"), $._predicate_access),
        $._proof_statement,
        $._match_statement,
        // TODO: match statement
      ),

    _match_statement: ($) =>
      seq("match", $._expression, "{", repeat($._match_statement_clause), "}"),
    _match_statement_clause: ($) =>
      seq($._match_case, ":", optional($._statement_list)),
    _match_case: ($) => choice(seq("case", $._match_pattern), "default"),
    _match_pattern: ($) =>
      choice(
        seq("?", $.identifier),
        // TODO: match pattern composite
        $._expression,
      ),

    package_statement: ($) => seq("package", $._expression, optional($.block)),
    apply_statement: ($) => seq("apply", $._expression),

    _simple_statement: ($) =>
      choice(
        $.expression_statement,
        $.send_statement,
        $.inc_statement,
        $.dec_statement,
        $.assignment_statement,
        $.short_var_declaration,
      ),

    expression_statement: ($) => $._expression,

    send_statement: ($) =>
      seq(field("channel", $._expression), "<-", field("value", $._expression)),

    receive_statement: ($) =>
      seq(
        optional(seq(field("left", $.expression_list), choice("=", ":="))),
        field("right", $._expression),
      ),

    inc_statement: ($) => seq($._expression, "++"),

    dec_statement: ($) => seq($._expression, "--"),

    assignment_statement: ($) =>
      seq(
        field("left", $.expression_list),
        field("operator", choice(...assignmentOperators)),
        field("right", $.expression_list),
      ),

    auxiliary_statement: ($) => choice($._statement_with_spec),
    _statement_with_spec: ($) => seq($._specification, $.outline_statement),
    outline_statement: ($) =>
      seq("outline", "(", optional($._statement_list), ")"),

    short_var_declaration: ($) =>
      seq(
        // TODO: this should really only allow identifier lists, but that causes
        // conflicts between identifiers as expressions vs identifiers here.
        field("left", $.expression_list),
        ":=",
        field("right", $.expression_list),
      ),

    labeled_statement: ($) =>
      seq(field("label", alias($.identifier, $.label_name)), ":", $._statement),

    empty_labeled_statement: ($) =>
      seq(field("label", alias($.identifier, $.label_name)), ":"),

    // This is a hack to prevent `fallthrough_statement` from being parsed as
    // a single token. For consistency with `break_statement` etc it should
    // be parsed as a parent node that *contains* a `fallthrough` token.
    fallthrough_statement: (_) => prec.left("fallthrough"),

    break_statement: ($) =>
      seq("break", optional(alias($.identifier, $.label_name))),

    continue_statement: ($) =>
      seq("continue", optional(alias($.identifier, $.label_name))),

    goto_statement: ($) => seq("goto", alias($.identifier, $.label_name)),

    return_statement: ($) => seq("return", optional($.expression_list)),

    go_statement: ($) => seq("go", $._expression),

    defer_statement: ($) =>
      choice(
        seq("defer", $._expression),
        seq(
          "defer",
          field("fold_statement", choice("fold", "unfold")),
          $._predicate_access,
        ),
      ),

    if_statement: ($) =>
      seq(
        "if",
        optional(seq(field("initializer", $._simple_statement), ";")),
        field("condition", $._expression),
        field("consequence", $.block),
        optional(
          seq("else", field("alternative", choice($.block, $.if_statement))),
        ),
      ),

    spec_for_statement: ($) => seq(optional($.loop_spec), $.for_statement),

    _loop_invariants: ($) =>
      repeat1(seq("invariant", $._expression, terminator)),
    _loop_termination: ($) => repeat1(seq($.termination_condition, terminator)),
    loop_spec: ($) =>
      choice(
        $._loop_invariants,
        $._loop_termination,
        seq($._loop_invariants, $._loop_termination),
      ),
    for_statement: ($) =>
      seq(
        "for",
        optional(choice($._expression, $.for_clause, $.range_clause)),
        field("body", $.block),
      ),

    for_clause: ($) =>
      seq(
        field("initializer", optional($._simple_statement)),
        ";",
        field("condition", optional($._expression)),
        ";",
        field("update", optional($._simple_statement)),
      ),

    range_clause: ($) =>
      seq(
        optional(seq(field("left", $.expression_list), choice("=", ":="))),
        "range",
        field("right", $._expression),
        optional($._range_with),
      ),
    _range_with: ($) => seq("with", field("range_var", $.identifier)),

    expression_switch_statement: ($) =>
      seq(
        "switch",
        optional(seq(field("initializer", $._simple_statement), ";")),
        field("value", optional($._expression)),
        "{",
        repeat(choice($.expression_case, $.default_case)),
        "}",
      ),

    expression_case: ($) =>
      seq(
        "case",
        field("value", $.expression_list),
        ":",
        optional($._statement_list),
      ),

    default_case: ($) => seq("default", ":", optional($._statement_list)),

    type_switch_statement: ($) =>
      seq(
        "switch",
        $._type_switch_header,
        "{",
        repeat(choice($.type_case, $.default_case)),
        "}",
      ),

    _type_switch_header: ($) =>
      seq(
        optional(seq(field("initializer", $._simple_statement), ";")),
        optional(seq(field("alias", $.expression_list), ":=")),
        field("value", $._expression),
        ".",
        "(",
        "type",
        ")",
      ),

    type_case: ($) =>
      seq(
        "case",
        field("type", commaSep1($._type)),
        ":",
        optional($._statement_list),
      ),

    select_statement: ($) =>
      seq(
        "select",
        "{",
        repeat(choice($.communication_case, $.default_case)),
        "}",
      ),

    communication_case: ($) =>
      seq(
        "case",
        field("communication", choice($.send_statement, $.receive_statement)),
        ":",
        optional($._statement_list),
      ),

    _primary_expr: ($) =>
      choice(
        $.composite_literal,
        $.func_literal,
        $._string_literal,
        $.int_literal,
        $.float_literal,
        $.imaginary_literal,
        $.rune_literal,
        $.identifier,
        alias(choice("new", "make"), $.identifier),
        $.call_expression,
        $.call_expression,
        $.selector_expression,
      ),

    _expression: ($) =>
      choice(
        $._primary_expr,
        $.unary_expression,
        $.binary_expression,
        $.ternary_expression,
        $.index_expression,
        $.slice_expression,
        $.type_assertion_expression,
        $.type_conversion_expression,
        $.type_instantiation_expression,
        $.nil,
        $.true,
        $.false,
        $.iota,
        $.parenthesized_expression,
        $.quantification,
        $.unfolding,
        $.let_expression,
      ),

    quantification: ($) =>
      seq(
        choice("forall", "exists"),
        $.bound_variables,
        ":",
        ":",
        optional($.triggers),
        $._expression,
      ),

    unfolding: ($) =>
      prec(
        PREC.unfolding,
        seq(
          "unfolding",
          field("predicate", $._primary_expr),
          "in",
          $._expression,
        ),
      ),
    _predicate_access: ($) => $._primary_expr,

    let_expression: ($) => seq("let", $.short_var_declaration, "in"),

    _ghost_primary_expr: ($) =>
      choice(
        $.match_expression,

        // TODO range
        // | access
        // | typeOf
        // | typeExpr
        // | isComparable
        // | old
        // | before
        // | sConversion
        // | optionNone | optionSome | optionGet
        // | permission
      ),

    match_expression: ($) =>
      seq(
        "match",
        $._expression,
        "{",
        repeat(seq($.match_expression_clause, terminator)),
        "}",
      ),

    match_expression_clause: ($) => seq($.match_case, ":", $._expression),
    match_case: ($) => choice("default", seq("case", $.match_pattern)),
    match_pattern: ($) =>
      choice(
        seq("?", $.identifier),
        seq(
          $._simple_type,
          "{",
          optional(seq($.match_pattern_list, optional(","))),
          "}",
        ),
        $._expression,
      ),
    match_pattern_list: ($) => commaSep1($.match_pattern),

    bound_variables: ($) =>
      seq(commaSep1($.bound_variable_declaration), optional(",")),
    bound_variable_declaration: ($) =>
      seq(commaSep1($.identifier), $.type_elem),
    triggers: ($) => repeat1($.trigger),
    trigger: ($) => seq("{", commaSep1($._expression), "}"),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    call_expression: ($) =>
      prec(
        PREC.primary,
        choice(
          seq(
            field("function", alias(choice("new", "make"), $.identifier)),
            field("arguments", alias($.special_argument_list, $.argument_list)),
          ),
          seq(
            field("function", $._expression),
            field("type_arguments", optional($.type_arguments)),
            field("arguments", $.argument_list),
          ),
          seq(
            "reveal",
            field("function", $._expression),
            field("type_arguments", optional($.type_arguments)),
            field("arguments", $.argument_list),
          ),
        ),
      ),

    variadic_argument: ($) => prec.right(seq($._expression, "...")),

    special_argument_list: ($) =>
      seq(
        "(",
        optional(seq($._type, repeat(seq(",", $._expression)), optional(","))),
        ")",
      ),

    argument_list: ($) =>
      seq(
        "(",
        optional(
          seq(
            choice($._expression, $.variadic_argument),
            repeat(seq(",", choice($._expression, $.variadic_argument))),
            optional(","),
          ),
        ),
        ")",
      ),

    selector_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          ".",
          field("field", $._field_identifier),
        ),
      ),

    index_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          "[",
          field("index", $._expression),
          "]",
        ),
      ),

    slice_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          "[",
          choice(
            seq(
              field("start", optional($._expression)),
              ":",
              field("end", optional($._expression)),
            ),
            seq(
              field("start", optional($._expression)),
              ":",
              field("end", $._expression),
              ":",
              field("capacity", $._expression),
            ),
          ),
          "]",
        ),
      ),

    type_assertion_expression: ($) =>
      prec(
        PREC.primary,
        seq(
          field("operand", $._expression),
          ".",
          "(",
          field("type", $._type),
          ")",
        ),
      ),

    type_conversion_expression: ($) =>
      prec.dynamic(
        -1,
        seq(
          field("type", $._type),
          "(",
          field("operand", $._expression),
          optional(","),
          ")",
        ),
      ),

    type_instantiation_expression: ($) =>
      prec.dynamic(
        -1,
        seq(
          field("type", $._type),
          "[",
          commaSep1($._type),
          optional(","),
          "]",
        ),
      ),

    composite_literal: ($) =>
      prec(
        PREC.composite_literal,
        seq(
          field(
            "type",
            choice(
              $.map_type,
              $.slice_type,
              $.array_type,
              $.implicit_length_array_type,
              $.struct_type,
              $._type_identifier,
              $.generic_type,
              $.qualified_type,
            ),
          ),
          field("body", $.literal_value),
        ),
      ),

    literal_value: ($) =>
      seq(
        "{",
        optional(
          seq(
            commaSep(choice($.literal_element, $.keyed_element)),
            optional(","),
          ),
        ),
        "}",
      ),

    literal_element: ($) => choice($._expression, $.literal_value),

    // In T{k: v}, the key k may be:
    // - any expression (when T is a map, slice or array),
    // - a field identifier (when T is a struct), or
    // - a literal_element (when T is an array).
    // The first two cases cannot be distinguished without type information.
    keyed_element: ($) => seq($.literal_element, ":", $.literal_element),

    func_literal: ($) =>
      seq(
        "func",
        field("parameters", $.parameter_list),
        field("result", optional(choice($.parameter_list, $._simple_type))),
        field("body", $.block),
      ),

    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "!", "^", "*", "&", "<-")),
          field("operand", $._expression),
        ),
      ),

    binary_expression: ($) => {
      const table = [
        [PREC.multiplicative, choice(...multiplicativeOperators)],
        [PREC.additive, choice(...additiveOperators)],
        [PREC.set_operations, choice(...setOperators)],
        [PREC.set_comparison, choice(...setComparisonOperators)],
        [PREC.comparative, choice(...comparativeOperators)],
        [PREC.impl, "implements"],
        [PREC.and, "&&"],
        [PREC.or, "||"],
      ];
      const rightTable = [[PREC.impl, "==>"]];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            // @ts-ignore
            precedence,
            seq(
              field("left", $._expression),
              // @ts-ignore
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
        ...rightTable.map(([precedence, operator]) =>
          // @ts-ignore
          prec.right(
            precedence,
            seq(
              field("left", $._expression),
              // @ts-ignore
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
      );
    },

    ternary_expression: ($) =>
      prec.right(
        PREC.qmark,
        seq(
          field("condition", $._expression),
          "?",
          field("left", $._expression),
          ":",
          field("right", $._expression),
        ),
      ),

    qualified_type: ($) =>
      seq(
        field("package", $._package_identifier),
        ".",
        field("name", $._type_identifier),
      ),

    identifier: (_) => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    _type_identifier: ($) => alias($.identifier, $.type_identifier),
    _field_identifier: ($) => alias($.identifier, $.field_identifier),
    _package_identifier: ($) => alias($.identifier, $.package_identifier),

    _string_literal: ($) =>
      choice($.raw_string_literal, $.interpreted_string_literal),

    raw_string_literal: (_) => token(seq("`", repeat(/[^`]/), "`")),

    interpreted_string_literal: ($) =>
      seq(
        '"',
        repeat(
          choice(
            $._interpreted_string_literal_basic_content,
            $.escape_sequence,
          ),
        ),
        token.immediate('"'),
      ),
    _interpreted_string_literal_basic_content: (_) =>
      token.immediate(prec(1, /[^"\n\\]+/)),

    escape_sequence: (_) =>
      token.immediate(
        seq(
          "\\",
          choice(
            /[^xuU]/,
            /\d{2,3}/,
            /x[0-9a-fA-F]{2,}/,
            /u[0-9a-fA-F]{4}/,
            /U[0-9a-fA-F]{8}/,
          ),
        ),
      ),

    int_literal: (_) => token(intLiteral),

    float_literal: (_) => token(floatLiteral),

    imaginary_literal: (_) => token(imaginaryLiteral),

    rune_literal: (_) =>
      token(
        seq(
          "'",
          choice(
            /[^'\\]/,
            seq(
              "\\",
              choice(
                seq("x", hexDigit, hexDigit),
                seq(octalDigit, octalDigit, octalDigit),
                seq("u", hexDigit, hexDigit, hexDigit, hexDigit),
                seq(
                  "U",
                  hexDigit,
                  hexDigit,
                  hexDigit,
                  hexDigit,
                  hexDigit,
                  hexDigit,
                  hexDigit,
                  hexDigit,
                ),
                seq(choice("a", "b", "f", "n", "r", "t", "v", "\\", "'", '"')),
              ),
            ),
          ),
          "'",
        ),
      ),

    nil: (_) => "nil",
    true: (_) => "true",
    false: (_) => "false",
    iota: (_) => "iota",

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: (_) =>
      token(
        choice(seq("//", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
      ),

    ///////// GOBRA /////////
  },
});

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`
 *
 * @param {RuleOrLiteral} rule
 *
 * @param {RuleOrLiteral} separator
 *
 * @return {SeqRule}
 *
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {SeqRule}
 *
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {ChoiceRule}
 *
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}
