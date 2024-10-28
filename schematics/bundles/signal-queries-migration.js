'use strict';
/**
 * @license Angular v19.1.0-next.0+sha-dca1483-with-local-changes
 * (c) 2010-2024 Google LLC. https://angular.io/
 * License: MIT
 */
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var schematics = require('@angular-devkit/schematics');
var project_tsconfig_paths = require('./project_tsconfig_paths-e9ccccbf.js');
var combine_units = require('./combine_units-6b541eeb.js');
require('os');
var ts = require('typescript');
var checker = require('./checker-5a528c82.js');
var program = require('./program-3605d265.js');
var assert = require('assert');
require('path');
var migrate_ts_type_references = require('./migrate_ts_type_references-426ff7be.js');
require('@angular-devkit/core');
require('node:path/posix');
require('fs');
require('module');
require('url');
require('./leading_space-d190b83b.js');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var ts__default = /*#__PURE__*/_interopDefaultLegacy(ts);
var assert__default = /*#__PURE__*/_interopDefaultLegacy(assert);

/**
 * Phase that migrates Angular host binding references to
 * unwrap signals.
 */
function migrateHostBindings(host, references, info) {
    const seenReferences = new WeakMap();
    for (const reference of references) {
        // This pass only deals with host binding references.
        if (!combine_units.isHostBindingReference(reference)) {
            continue;
        }
        // Skip references to incompatible inputs.
        if (!host.shouldMigrateReferencesToField(reference.target)) {
            continue;
        }
        const bindingField = reference.from.hostPropertyNode;
        const expressionOffset = bindingField.getStart() + 1; // account for quotes.
        const readEndPos = expressionOffset + reference.from.read.sourceSpan.end;
        // Skip duplicate references. Can happen if the host object is shared.
        if (seenReferences.get(bindingField)?.has(readEndPos)) {
            continue;
        }
        if (seenReferences.has(bindingField)) {
            seenReferences.get(bindingField).add(readEndPos);
        }
        else {
            seenReferences.set(bindingField, new Set([readEndPos]));
        }
        // Expand shorthands like `{bla}` to `{bla: bla()}`.
        const appendText = reference.from.isObjectShorthandExpression
            ? `: ${reference.from.read.name}()`
            : `()`;
        host.replacements.push(new combine_units.Replacement(combine_units.projectFile(bindingField.getSourceFile(), info), new combine_units.TextUpdate({ position: readEndPos, end: readEndPos, toInsert: appendText })));
    }
}

/**
 * Phase that migrates Angular template references to
 * unwrap signals.
 */
function migrateTemplateReferences(host, references) {
    const seenFileReferences = new Set();
    for (const reference of references) {
        // This pass only deals with HTML template references.
        if (!combine_units.isTemplateReference(reference)) {
            continue;
        }
        // Skip references to incompatible inputs.
        if (!host.shouldMigrateReferencesToField(reference.target)) {
            continue;
        }
        // Skip duplicate references. E.g. if a template is shared.
        const fileReferenceId = `${reference.from.templateFile.id}:${reference.from.read.sourceSpan.end}`;
        if (seenFileReferences.has(fileReferenceId)) {
            continue;
        }
        seenFileReferences.add(fileReferenceId);
        // Expand shorthands like `{bla}` to `{bla: bla()}`.
        const appendText = reference.from.isObjectShorthandExpression
            ? `: ${reference.from.read.name}()`
            : `()`;
        host.replacements.push(new combine_units.Replacement(reference.from.templateFile, new combine_units.TextUpdate({
            position: reference.from.read.sourceSpan.end,
            end: reference.from.read.sourceSpan.end,
            toInsert: appendText,
        })));
    }
}

/**
 * Extracts the type `T` of expressions referencing `QueryList<T>`.
 */
function extractQueryListType(node) {
    // Initializer variant of `new QueryList<T>()`.
    if (ts__default["default"].isNewExpression(node) &&
        ts__default["default"].isIdentifier(node.expression) &&
        node.expression.text === 'QueryList') {
        return node.typeArguments?.[0];
    }
    // Type variant of `: QueryList<T>`.
    if (ts__default["default"].isTypeReferenceNode(node) &&
        ts__default["default"].isIdentifier(node.typeName) &&
        node.typeName.text === 'QueryList') {
        return node.typeArguments?.[0];
    }
    return undefined;
}

/**
 *  A few notes on changes:
 *
 *    @ViewChild()
 *       --> static is gone!
 *       --> read stays
 *
 *    @ViewChildren()
 *       --> emitDistinctChangesOnly is gone!
 *       --> read stays
 *
 *    @ContentChild()
 *       --> descendants stays
 *       --> read stays
 *       --> static is gone!
 *
 *    @ContentChildren()
 *       --> descendants stays
 *       --> read stays
 *       --> emitDistinctChangesOnly is gone!
 */
function computeReplacementsToMigrateQuery(node, metadata, importManager, info, printer, options, checker$1) {
    const sf = node.getSourceFile();
    let newQueryFn = importManager.addImport({
        requestedFile: sf,
        exportModuleSpecifier: '@angular/core',
        exportSymbolName: metadata.kind,
    });
    // The default value for descendants is `true`, except for `ContentChildren`.
    const defaultDescendants = metadata.kind !== 'contentChildren';
    const optionProperties = [];
    const args = [
        metadata.args[0], // Locator.
    ];
    let type = node.type;
    // For multi queries, attempt to unwrap `QueryList` types, or infer the
    // type from the initializer, if possible.
    if (!metadata.queryInfo.first) {
        if (type === undefined && node.initializer !== undefined) {
            type = extractQueryListType(node.initializer);
        }
        else if (type !== undefined) {
            type = extractQueryListType(type);
        }
    }
    if (metadata.queryInfo.read !== null) {
        assert__default["default"](metadata.queryInfo.read instanceof checker.WrappedNodeExpr);
        optionProperties.push(ts__default["default"].factory.createPropertyAssignment('read', metadata.queryInfo.read.node));
    }
    if (metadata.queryInfo.descendants !== defaultDescendants) {
        optionProperties.push(ts__default["default"].factory.createPropertyAssignment('descendants', metadata.queryInfo.descendants ? ts__default["default"].factory.createTrue() : ts__default["default"].factory.createFalse()));
    }
    if (optionProperties.length > 0) {
        args.push(ts__default["default"].factory.createObjectLiteralExpression(optionProperties));
    }
    const strictNullChecksEnabled = options.strict === true || options.strictNullChecks === true;
    const strictPropertyInitialization = options.strict === true || options.strictPropertyInitialization === true;
    let isRequired = node.exclamationToken !== undefined;
    // If we come across an application with strict null checks enabled, but strict
    // property initialization is disabled, there are two options:
    //   - Either the query is already typed to include `undefined` explicitly,
    //     in which case an option query makes sense.
    //   - OR, the query is not typed to include `undefined`. In which case, the query
    //     should be marked as required to not break the app. The user-code throughout
    //     the application (given strict null checks) already assumes non-nullable!
    if (strictNullChecksEnabled &&
        !strictPropertyInitialization &&
        node.initializer === undefined &&
        node.questionToken === undefined &&
        type !== undefined &&
        !checker$1.isTypeAssignableTo(checker$1.getUndefinedType(), checker$1.getTypeFromTypeNode(type))) {
        isRequired = true;
    }
    if (isRequired && metadata.queryInfo.first) {
        // If the query is required already via some indicators, and this is a "single"
        // query, use the available `.required` method.
        newQueryFn = ts__default["default"].factory.createPropertyAccessExpression(newQueryFn, 'required');
    }
    // If this query is still nullable (i.e. not required), attempt to remove
    // explicit `undefined` types if possible.
    if (!isRequired && type !== undefined && ts__default["default"].isUnionTypeNode(type)) {
        type = migrate_ts_type_references.removeFromUnionIfPossible(type, (v) => v.kind !== ts__default["default"].SyntaxKind.UndefinedKeyword);
    }
    let locatorType = Array.isArray(metadata.queryInfo.predicate)
        ? null
        : metadata.queryInfo.predicate.expression;
    let resolvedReadType = metadata.queryInfo.read ?? locatorType;
    // If the original property type and the read type are matching, we can rely
    // on the TS inference, instead of repeating types, like in `viewChild<Button>(Button)`.
    if (type !== undefined &&
        resolvedReadType instanceof checker.WrappedNodeExpr &&
        ts__default["default"].isIdentifier(resolvedReadType.node) &&
        ts__default["default"].isTypeReferenceNode(type) &&
        ts__default["default"].isIdentifier(type.typeName) &&
        type.typeName.text === resolvedReadType.node.text) {
        locatorType = null;
    }
    const call = ts__default["default"].factory.createCallExpression(newQueryFn, 
    // If there is no resolved `ReadT` (e.g. string predicate), we use the
    // original type explicitly as generic. Otherwise, query API is smart
    // enough to always infer.
    resolvedReadType === null && type !== undefined ? [type] : undefined, args);
    const updated = ts__default["default"].factory.createPropertyDeclaration([ts__default["default"].factory.createModifier(ts__default["default"].SyntaxKind.ReadonlyKeyword)], node.name, undefined, undefined, call);
    return [
        new combine_units.Replacement(combine_units.projectFile(node.getSourceFile(), info), new combine_units.TextUpdate({
            position: node.getStart(),
            end: node.getEnd(),
            toInsert: printer.printNode(ts__default["default"].EmitHint.Unspecified, updated, sf),
        })),
    ];
}

/**
 * Attempts to get a class field descriptor if the given symbol
 * points to a class field.
 */
function getClassFieldDescriptorForSymbol(symbol, info) {
    if (symbol?.valueDeclaration === undefined ||
        !ts__default["default"].isPropertyDeclaration(symbol.valueDeclaration)) {
        return null;
    }
    const key = getUniqueIDForClassProperty(symbol.valueDeclaration, info);
    if (key === null) {
        return null;
    }
    return {
        key,
        node: symbol.valueDeclaration,
    };
}
/**
 * Gets a unique ID for the given class property.
 *
 * This is useful for matching class fields across compilation units.
 * E.g. a reference may point to the field via `.d.ts`, while the other
 * may reference it via actual `.ts` sources. IDs for the same fields
 * would then match identity.
 */
function getUniqueIDForClassProperty(property, info) {
    if (!ts__default["default"].isClassDeclaration(property.parent) || property.parent.name === undefined) {
        return null;
    }
    if (property.name === undefined) {
        return null;
    }
    const id = combine_units.projectFile(property.getSourceFile(), info).id.replace(/\.d\.ts$/, '.ts');
    // Note: If a class is nested, there could be an ID clash.
    // This is highly unlikely though, and this is not a problem because
    // in such cases, there is even less chance there are any references to
    // a non-exported classes; in which case, cross-compilation unit references
    // likely can't exist anyway.
    return `${id}-${property.parent.name.text}-${property.name.getText()}`;
}

/**
 * Determines if the given node refers to a decorator-based query, and
 * returns its resolved metadata if possible.
 */
function extractSourceQueryDefinition(node, reflector, evaluator, info) {
    if ((!ts__default["default"].isPropertyDeclaration(node) && !ts__default["default"].isAccessor(node)) ||
        !ts__default["default"].isClassDeclaration(node.parent) ||
        node.parent.name === undefined ||
        !ts__default["default"].isIdentifier(node.name)) {
        return null;
    }
    const decorators = reflector.getDecoratorsOfDeclaration(node) ?? [];
    const ngDecorators = checker.getAngularDecorators(decorators, program.queryDecoratorNames, /* isCore */ false);
    if (ngDecorators.length === 0) {
        return null;
    }
    const decorator = ngDecorators[0];
    const id = getUniqueIDForClassProperty(node, info);
    if (id === null) {
        return null;
    }
    let kind;
    if (decorator.name === 'ViewChild') {
        kind = 'viewChild';
    }
    else if (decorator.name === 'ViewChildren') {
        kind = 'viewChildren';
    }
    else if (decorator.name === 'ContentChild') {
        kind = 'contentChild';
    }
    else if (decorator.name === 'ContentChildren') {
        kind = 'contentChildren';
    }
    else {
        throw new Error('Unexpected query decorator detected.');
    }
    let queryInfo = null;
    try {
        queryInfo = program.extractDecoratorQueryMetadata(node, decorator.name, decorator.args ?? [], node.name.text, reflector, evaluator);
    }
    catch (e) {
        if (!(e instanceof checker.FatalDiagnosticError)) {
            throw e;
        }
        console.error(`Skipping query: ${e.node.getSourceFile().fileName}: ${e.toString()}`);
        return null;
    }
    return {
        id,
        kind,
        args: decorator.args ?? [],
        queryInfo,
        node: node,
        fieldDecorators: decorators,
    };
}

function markFieldIncompatibleInMetadata(data, id, reason) {
    const existing = data[id];
    if (existing === undefined) {
        data[id] = {
            fieldReason: reason,
            classReason: null,
        };
    }
    else if (existing.fieldReason === null) {
        existing.fieldReason = reason;
    }
    else {
        existing.fieldReason = migrate_ts_type_references.pickFieldIncompatibility({ reason, context: null }, { reason: existing.fieldReason, context: null }).reason;
    }
}
function filterBestEffortIncompatibilities(knownQueries) {
    for (const query of Object.values(knownQueries.globalMetadata.problematicQueries)) {
        if (query.fieldReason !== null &&
            !migrate_ts_type_references.nonIgnorableFieldIncompatibilities.includes(query.fieldReason)) {
            query.fieldReason = null;
        }
    }
}

class KnownQueries {
    constructor(info, config, globalMetadata) {
        this.info = info;
        this.config = config;
        this.globalMetadata = globalMetadata;
        this.classToQueryFields = new Map();
        this.knownQueryIDs = new Map();
    }
    isFieldIncompatible(descriptor) {
        return this.getIncompatibilityForField(descriptor) !== null;
    }
    markFieldIncompatible(field, incompatibility) {
        markFieldIncompatibleInMetadata(this.globalMetadata.problematicQueries, field.key, incompatibility.reason);
    }
    markClassIncompatible(node, reason) {
        this.classToQueryFields.get(node)?.forEach((f) => {
            this.globalMetadata.problematicQueries[f.key] ??= { classReason: null, fieldReason: null };
            this.globalMetadata.problematicQueries[f.key].classReason = reason;
        });
    }
    registerQueryField(queryField, id) {
        if (!this.classToQueryFields.has(queryField.parent)) {
            this.classToQueryFields.set(queryField.parent, []);
        }
        this.classToQueryFields.get(queryField.parent).push({
            key: id,
            node: queryField,
        });
        this.knownQueryIDs.set(id, { key: id, node: queryField });
        const descriptor = { key: id, node: queryField };
        const file = combine_units.projectFile(queryField.getSourceFile(), this.info);
        if (this.config.shouldMigrateQuery !== undefined &&
            !this.config.shouldMigrateQuery(descriptor, file)) {
            this.markFieldIncompatible(descriptor, {
                context: null,
                reason: migrate_ts_type_references.FieldIncompatibilityReason.SkippedViaConfigFilter,
            });
        }
    }
    attemptRetrieveDescriptorFromSymbol(symbol) {
        const descriptor = getClassFieldDescriptorForSymbol(symbol, this.info);
        if (descriptor !== null && this.knownQueryIDs.has(descriptor.key)) {
            return descriptor;
        }
        return null;
    }
    shouldTrackClassReference(clazz) {
        return this.classToQueryFields.has(clazz);
    }
    getQueryFieldsOfClass(clazz) {
        return this.classToQueryFields.get(clazz);
    }
    getAllClassesWithQueries() {
        return Array.from(this.classToQueryFields.keys()).filter((c) => ts__default["default"].isClassDeclaration(c));
    }
    captureKnownFieldInheritanceRelationship(derived, parent) {
        // Note: The edge problematic pattern recognition is not as good as the one
        // we have in the signal input migration. That is because we couldn't trivially
        // build up an inheritance graph during analyze phase where we DON'T know what
        // fields refer to queries. Usually we'd use the graph to smartly propagate
        // incompatibilities using topological sort. This doesn't work here and is
        // unnecessarily complex, so we try our best at detecting direct edge
        // incompatibilities (which are quite order dependent).
        if (this.isFieldIncompatible(parent) && !this.isFieldIncompatible(derived)) {
            this.markFieldIncompatible(derived, {
                context: null,
                reason: migrate_ts_type_references.FieldIncompatibilityReason.ParentIsIncompatible,
            });
            return;
        }
        if (this.isFieldIncompatible(derived) && !this.isFieldIncompatible(parent)) {
            this.markFieldIncompatible(parent, {
                context: null,
                reason: migrate_ts_type_references.FieldIncompatibilityReason.DerivedIsIncompatible,
            });
        }
    }
    captureUnknownDerivedField(field) {
        this.markFieldIncompatible(field, {
            context: null,
            reason: migrate_ts_type_references.FieldIncompatibilityReason.OverriddenByDerivedClass,
        });
    }
    captureUnknownParentField(field) {
        this.markFieldIncompatible(field, {
            context: null,
            reason: migrate_ts_type_references.FieldIncompatibilityReason.TypeConflictWithBaseClass,
        });
    }
    getIncompatibilityForField(descriptor) {
        const problematicInfo = this.globalMetadata.problematicQueries[descriptor.key];
        if (problematicInfo === undefined) {
            return null;
        }
        if (problematicInfo.fieldReason !== null) {
            return { context: null, reason: problematicInfo.fieldReason };
        }
        if (problematicInfo.classReason !== null) {
            return problematicInfo.classReason;
        }
        return null;
    }
    getIncompatibilityTextForField(field) {
        const incompatibilityInfo = this.globalMetadata.problematicQueries[field.key];
        if (incompatibilityInfo.fieldReason !== null) {
            return migrate_ts_type_references.getMessageForFieldIncompatibility(incompatibilityInfo.fieldReason, {
                single: 'query',
                plural: 'queries',
            });
        }
        if (incompatibilityInfo.classReason !== null) {
            return migrate_ts_type_references.getMessageForClassIncompatibility(incompatibilityInfo.classReason, {
                single: 'query',
                plural: 'queries',
            });
        }
        return null;
    }
}

/** Converts an initializer query API name to its decorator-equivalent. */
function queryFunctionNameToDecorator(name) {
    if (name === 'viewChild') {
        return 'ViewChild';
    }
    else if (name === 'viewChildren') {
        return 'ViewChildren';
    }
    else if (name === 'contentChild') {
        return 'ContentChild';
    }
    else if (name === 'contentChildren') {
        return 'ContentChildren';
    }
    throw new Error(`Unexpected query function name: ${name}`);
}

/**
 * Gets whether the given field is accessed via the
 * given reference.
 *
 * E.g. whether `<my-read>.toArray` is detected.
 */
function checkTsReferenceAccessesField(ref, fieldName) {
    const accessNode = combine_units.traverseAccess(ref.from.node);
    // Check if the reference is part of a property access.
    if (!ts__default["default"].isPropertyAccessExpression(accessNode.parent) ||
        !ts__default["default"].isIdentifier(accessNode.parent.name)) {
        return null;
    }
    // Check if the reference is refers to the given field name.
    if (accessNode.parent.name.text !== fieldName) {
        return null;
    }
    return accessNode.parent;
}
/**
 * Gets whether the given read is used to access
 * the specified field.
 *
 * E.g. whether `<my-read>.toArray` is detected.
 */
function checkNonTsReferenceAccessesField(ref, fieldName) {
    const readFromPath = ref.from.readAstPath.at(-1);
    const parentRead = ref.from.readAstPath.at(-2);
    if (ref.from.read !== readFromPath) {
        return null;
    }
    if (!(parentRead instanceof checker.PropertyRead) || parentRead.name !== fieldName) {
        return null;
    }
    return parentRead;
}
/**
 * Gets whether the given reference is accessed to call the
 * specified function on it.
 *
 * E.g. whether `<my-read>.toArray()` is detected.
 */
function checkTsReferenceCallsField(ref, fieldName) {
    const propertyAccess = checkTsReferenceAccessesField(ref, fieldName);
    if (propertyAccess === null) {
        return null;
    }
    if (ts__default["default"].isCallExpression(propertyAccess.parent) &&
        propertyAccess.parent.expression === propertyAccess) {
        return propertyAccess.parent;
    }
    return null;
}
/**
 * Gets whether the given reference is accessed to call the
 * specified function on it.
 *
 * E.g. whether `<my-read>.toArray()` is detected.
 */
function checkNonTsReferenceCallsField(ref, fieldName) {
    const propertyAccess = checkNonTsReferenceAccessesField(ref, fieldName);
    if (propertyAccess === null) {
        return null;
    }
    const accessIdx = ref.from.readAstPath.indexOf(propertyAccess);
    if (accessIdx === -1) {
        return null;
    }
    const potentialCall = ref.from.readAstPath[accessIdx - 1];
    if (potentialCall === undefined || !(potentialCall instanceof checker.Call)) {
        return null;
    }
    return potentialCall;
}

function removeQueryListToArrayCall(ref, info, globalMetadata, knownQueries, replacements) {
    if (!combine_units.isHostBindingReference(ref) && !combine_units.isTemplateReference(ref) && !combine_units.isTsReference(ref)) {
        return;
    }
    if (knownQueries.isFieldIncompatible(ref.target)) {
        return;
    }
    if (!globalMetadata.knownQueryFields[ref.target.key]?.isMulti) {
        return;
    }
    // TS references.
    if (combine_units.isTsReference(ref)) {
        const toArrayCallExpr = checkTsReferenceCallsField(ref, 'toArray');
        if (toArrayCallExpr === null) {
            return;
        }
        const toArrayExpr = toArrayCallExpr.expression;
        replacements.push(new combine_units.Replacement(combine_units.projectFile(toArrayExpr.getSourceFile(), info), new combine_units.TextUpdate({
            // Delete from expression end to call end. E.g. `.toArray(<..>)`.
            position: toArrayExpr.expression.getEnd(),
            end: toArrayCallExpr.getEnd(),
            toInsert: '',
        })));
        return;
    }
    // Template and host binding references.
    const callExpr = checkNonTsReferenceCallsField(ref, 'toArray');
    if (callExpr === null) {
        return;
    }
    const file = combine_units.isHostBindingReference(ref) ? ref.from.file : ref.from.templateFile;
    const offset = combine_units.isHostBindingReference(ref) ? ref.from.hostPropertyNode.getStart() + 1 : 0;
    replacements.push(new combine_units.Replacement(file, new combine_units.TextUpdate({
        // Delete from expression end to call end. E.g. `.toArray(<..>)`.
        position: offset + callExpr.receiver.receiver.sourceSpan.end,
        end: offset + callExpr.sourceSpan.end,
        toInsert: '',
    })));
}

function replaceQueryListGetCall(ref, info, globalMetadata, knownQueries, replacements) {
    if (!combine_units.isHostBindingReference(ref) && !combine_units.isTemplateReference(ref) && !combine_units.isTsReference(ref)) {
        return;
    }
    if (knownQueries.isFieldIncompatible(ref.target)) {
        return;
    }
    if (!globalMetadata.knownQueryFields[ref.target.key]?.isMulti) {
        return;
    }
    if (combine_units.isTsReference(ref)) {
        const getCallExpr = checkTsReferenceCallsField(ref, 'get');
        if (getCallExpr === null) {
            return;
        }
        const getExpr = getCallExpr.expression;
        replacements.push(new combine_units.Replacement(combine_units.projectFile(getExpr.getSourceFile(), info), new combine_units.TextUpdate({
            position: getExpr.name.getStart(),
            end: getExpr.name.getEnd(),
            toInsert: 'at',
        })));
        return;
    }
    // Template and host binding references.
    const callExpr = checkNonTsReferenceCallsField(ref, 'get');
    if (callExpr === null) {
        return;
    }
    const file = combine_units.isHostBindingReference(ref) ? ref.from.file : ref.from.templateFile;
    const offset = combine_units.isHostBindingReference(ref) ? ref.from.hostPropertyNode.getStart() + 1 : 0;
    replacements.push(new combine_units.Replacement(file, new combine_units.TextUpdate({
        position: offset + callExpr.receiver.nameSpan.start,
        end: offset + callExpr.receiver.nameSpan.end,
        toInsert: 'at',
    })));
}

const problematicQueryListMethods = [
    'dirty',
    'changes',
    'setDirty',
    'reset',
    'notifyOnChanges',
    'destroy',
];
function checkForIncompatibleQueryListAccesses(ref, result) {
    if (combine_units.isTsReference(ref)) {
        for (const problematicFn of problematicQueryListMethods) {
            const access = checkTsReferenceAccessesField(ref, problematicFn);
            if (access !== null) {
                result.potentialProblematicReferenceForMultiQueries[ref.target.key] = true;
                return;
            }
        }
    }
    if (combine_units.isHostBindingReference(ref) || combine_units.isTemplateReference(ref)) {
        for (const problematicFn of problematicQueryListMethods) {
            const access = checkNonTsReferenceAccessesField(ref, problematicFn);
            if (access !== null) {
                result.potentialProblematicReferenceForMultiQueries[ref.target.key] = true;
                return;
            }
        }
    }
}

const mapping = new Map([
    ['first', 'at(0)!'],
    ['last', 'at(-1)!'],
]);
function replaceQueryListFirstAndLastReferences(ref, info, globalMetadata, knownQueries, replacements) {
    if (!combine_units.isHostBindingReference(ref) && !combine_units.isTemplateReference(ref) && !combine_units.isTsReference(ref)) {
        return;
    }
    if (knownQueries.isFieldIncompatible(ref.target)) {
        return;
    }
    if (!globalMetadata.knownQueryFields[ref.target.key]?.isMulti) {
        return;
    }
    if (combine_units.isTsReference(ref)) {
        const expr = checkTsReferenceAccessesField(ref, 'first') ?? checkTsReferenceAccessesField(ref, 'last');
        if (expr === null) {
            return;
        }
        replacements.push(new combine_units.Replacement(combine_units.projectFile(expr.getSourceFile(), info), new combine_units.TextUpdate({
            position: expr.name.getStart(),
            end: expr.name.getEnd(),
            toInsert: mapping.get(expr.name.text),
        })));
        return;
    }
    // Template and host binding references.
    const expr = checkNonTsReferenceAccessesField(ref, 'first') ?? checkNonTsReferenceAccessesField(ref, 'last');
    if (expr === null) {
        return;
    }
    const file = combine_units.isHostBindingReference(ref) ? ref.from.file : ref.from.templateFile;
    const offset = combine_units.isHostBindingReference(ref) ? ref.from.hostPropertyNode.getStart() + 1 : 0;
    replacements.push(new combine_units.Replacement(file, new combine_units.TextUpdate({
        position: offset + expr.nameSpan.start,
        end: offset + expr.nameSpan.end,
        toInsert: mapping.get(expr.name),
    })));
}

class SignalQueriesMigration extends combine_units.TsurgeComplexMigration {
    constructor(config = {}) {
        super();
        this.config = config;
    }
    async analyze(info) {
        assert__default["default"](info.ngCompiler !== null, 'Expected queries migration to have an Angular program.');
        // Pre-Analyze the program and get access to the template type checker.
        const { templateTypeChecker } = info.ngCompiler['ensureAnalyzed']();
        const { sourceFiles, program: program$1 } = info;
        const checker$1 = program$1.getTypeChecker();
        const reflector = new checker.TypeScriptReflectionHost(checker$1);
        const evaluator = new program.PartialEvaluator(reflector, checker$1, null);
        const res = {
            knownQueryFields: {},
            potentialProblematicQueries: {},
            potentialProblematicReferenceForMultiQueries: {},
            reusableAnalysisReferences: null,
        };
        const groupedAstVisitor = new migrate_ts_type_references.GroupedTsAstVisitor(sourceFiles);
        const referenceResult = { references: [] };
        const classesWithFilteredQueries = new Set();
        const filteredQueriesForCompilationUnit = new Map();
        const findQueryDefinitionsVisitor = (node) => {
            const extractedQuery = extractSourceQueryDefinition(node, reflector, evaluator, info);
            if (extractedQuery !== null) {
                const queryNode = extractedQuery.node;
                const descriptor = {
                    key: extractedQuery.id,
                    node: queryNode,
                };
                const containingFile = combine_units.projectFile(queryNode.getSourceFile(), info);
                // If we have a config filter function, use it here for later
                // perf-boosted reference lookups. Useful in non-batch mode.
                if (this.config.shouldMigrateQuery === undefined ||
                    this.config.shouldMigrateQuery(descriptor, containingFile)) {
                    classesWithFilteredQueries.add(queryNode.parent);
                    filteredQueriesForCompilationUnit.set(extractedQuery.id, {
                        fieldName: extractedQuery.queryInfo.propertyName,
                    });
                }
                res.knownQueryFields[extractedQuery.id] = {
                    fieldName: extractedQuery.queryInfo.propertyName,
                    isMulti: extractedQuery.queryInfo.first === false,
                };
                if (ts__default["default"].isAccessor(queryNode)) {
                    markFieldIncompatibleInMetadata(res.potentialProblematicQueries, extractedQuery.id, migrate_ts_type_references.FieldIncompatibilityReason.Accessor);
                }
                // Detect queries with union types that are uncommon to be
                // automatically migrate-able. E.g. `refs: ElementRef|null`,
                // or `ElementRef|SomeOtherType`.
                if (queryNode.type !== undefined &&
                    ts__default["default"].isUnionTypeNode(queryNode.type) &&
                    // Either too large union, or doesn't match `T|undefined`.
                    (queryNode.type.types.length > 2 ||
                        !queryNode.type.types.some((t) => t.kind === ts__default["default"].SyntaxKind.UndefinedKeyword))) {
                    markFieldIncompatibleInMetadata(res.potentialProblematicQueries, extractedQuery.id, migrate_ts_type_references.FieldIncompatibilityReason.SignalQueries__IncompatibleMultiUnionType);
                }
                // Migrating fields with `@HostBinding` is incompatible as
                // the host binding decorator does not invoke the signal.
                const hostBindingDecorators = checker.getAngularDecorators(extractedQuery.fieldDecorators, ['HostBinding'], 
                /* isCore */ false);
                if (hostBindingDecorators.length > 0) {
                    markFieldIncompatibleInMetadata(res.potentialProblematicQueries, extractedQuery.id, migrate_ts_type_references.FieldIncompatibilityReason.SignalIncompatibleWithHostBinding);
                }
            }
        };
        this.config.reportProgressFn?.(20, 'Scanning for queries..');
        groupedAstVisitor.register(findQueryDefinitionsVisitor);
        groupedAstVisitor.execute();
        const allFieldsOrKnownQueries = {
            // Note: We don't support cross-target migration of `Partial<T>` usages.
            // This is an acceptable limitation for performance reasons.
            shouldTrackClassReference: (node) => classesWithFilteredQueries.has(node),
            attemptRetrieveDescriptorFromSymbol: (s) => {
                const descriptor = getClassFieldDescriptorForSymbol(s, info);
                // If we are executing in upgraded analysis phase mode, we know all
                // of the queries since there aren't any other compilation units.
                // Ignore references to non-query class fields.
                if (this.config.assumeNonBatch &&
                    descriptor !== null &&
                    !filteredQueriesForCompilationUnit.has(descriptor.key)) {
                    return null;
                }
                // In batch mode, we eagerly, rather expensively, track all references.
                // We don't know yet if something refers to a different query or not, so we
                // eagerly detect such and later filter those problematic references that
                // turned out to refer to queries (once we have the global metadata).
                return descriptor;
            },
        };
        groupedAstVisitor.register(combine_units.createFindAllSourceFileReferencesVisitor(info, checker$1, reflector, info.ngCompiler['resourceManager'], evaluator, templateTypeChecker, allFieldsOrKnownQueries, 
        // In non-batch mode, we know what inputs exist and can optimize the reference
        // resolution significantly (for e.g. VSCode integration)— as we know what
        // field names may be used to reference potential queries.
        this.config.assumeNonBatch
            ? new Set(Array.from(filteredQueriesForCompilationUnit.values()).map((f) => f.fieldName))
            : null, referenceResult).visitor);
        const inheritanceGraph = new migrate_ts_type_references.InheritanceGraph(checker$1).expensivePopulate(info.sourceFiles);
        migrate_ts_type_references.checkIncompatiblePatterns(inheritanceGraph, checker$1, groupedAstVisitor, {
            ...allFieldsOrKnownQueries,
            isFieldIncompatible: (f) => res.potentialProblematicQueries[f.key]?.fieldReason !== null ||
                res.potentialProblematicQueries[f.key]?.classReason !== null,
            markClassIncompatible: (clazz, reason) => {
                for (const field of clazz.members) {
                    const key = getUniqueIDForClassProperty(field, info);
                    if (key !== null) {
                        res.potentialProblematicQueries[key] ??= { classReason: null, fieldReason: null };
                        res.potentialProblematicQueries[key].classReason = reason;
                    }
                }
            },
            markFieldIncompatible: (f, incompatibility) => markFieldIncompatibleInMetadata(res.potentialProblematicQueries, f.key, incompatibility.reason),
        }, () => Array.from(classesWithFilteredQueries));
        this.config.reportProgressFn?.(60, 'Scanning for references and problematic patterns..');
        groupedAstVisitor.execute();
        // Determine incompatible queries based on problematic references
        // we saw in TS code, templates or host bindings.
        for (const ref of referenceResult.references) {
            if (combine_units.isTsReference(ref) && ref.from.isWrite) {
                markFieldIncompatibleInMetadata(res.potentialProblematicQueries, ref.target.key, migrate_ts_type_references.FieldIncompatibilityReason.WriteAssignment);
            }
            if ((combine_units.isTemplateReference(ref) || combine_units.isHostBindingReference(ref)) && ref.from.isWrite) {
                markFieldIncompatibleInMetadata(res.potentialProblematicQueries, ref.target.key, migrate_ts_type_references.FieldIncompatibilityReason.WriteAssignment);
            }
            // TODO: Remove this when we support signal narrowing in templates.
            // https://github.com/angular/angular/pull/55456.
            if (combine_units.isTemplateReference(ref) && ref.from.isLikelyPartOfNarrowing) {
                markFieldIncompatibleInMetadata(res.potentialProblematicQueries, ref.target.key, migrate_ts_type_references.FieldIncompatibilityReason.PotentiallyNarrowedInTemplateButNoSupportYet);
            }
            // Check for other incompatible query list accesses.
            checkForIncompatibleQueryListAccesses(ref, res);
        }
        if (this.config.assumeNonBatch) {
            res.reusableAnalysisReferences = referenceResult.references;
        }
        return combine_units.confirmAsSerializable(res);
    }
    async combine(unitA, unitB) {
        const combined = {
            knownQueryFields: {},
            potentialProblematicQueries: {},
            potentialProblematicReferenceForMultiQueries: {},
            reusableAnalysisReferences: null,
        };
        for (const unit of [unitA, unitB]) {
            for (const [id, value] of Object.entries(unit.knownQueryFields)) {
                combined.knownQueryFields[id] = value;
            }
            for (const [id, info] of Object.entries(unit.potentialProblematicQueries)) {
                if (info.fieldReason !== null) {
                    markFieldIncompatibleInMetadata(combined.potentialProblematicQueries, id, info.fieldReason);
                }
                if (info.classReason !== null) {
                    combined.potentialProblematicQueries[id] ??= {
                        classReason: null,
                        fieldReason: null,
                    };
                    combined.potentialProblematicQueries[id].classReason =
                        info.classReason;
                }
            }
            for (const id of Object.keys(unit.potentialProblematicReferenceForMultiQueries)) {
                combined.potentialProblematicReferenceForMultiQueries[id] = true;
            }
            if (unit.reusableAnalysisReferences !== null) {
                combined.reusableAnalysisReferences = unit.reusableAnalysisReferences;
            }
        }
        for (const unit of [unitA, unitB]) {
            for (const id of Object.keys(unit.potentialProblematicReferenceForMultiQueries)) {
                if (combined.knownQueryFields[id]?.isMulti) {
                    markFieldIncompatibleInMetadata(combined.potentialProblematicQueries, id, migrate_ts_type_references.FieldIncompatibilityReason.SignalQueries__QueryListProblematicFieldAccessed);
                }
            }
        }
        return combine_units.confirmAsSerializable(combined);
    }
    async globalMeta(combinedData) {
        const globalUnitData = {
            knownQueryFields: combinedData.knownQueryFields,
            problematicQueries: combinedData.potentialProblematicQueries,
            reusableAnalysisReferences: combinedData.reusableAnalysisReferences,
        };
        for (const id of Object.keys(combinedData.potentialProblematicReferenceForMultiQueries)) {
            if (combinedData.knownQueryFields[id]?.isMulti) {
                markFieldIncompatibleInMetadata(globalUnitData.problematicQueries, id, migrate_ts_type_references.FieldIncompatibilityReason.SignalQueries__QueryListProblematicFieldAccessed);
            }
        }
        return combine_units.confirmAsSerializable(globalUnitData);
    }
    async migrate(globalMetadata, info) {
        assert__default["default"](info.ngCompiler !== null, 'Expected queries migration to have an Angular program.');
        // Pre-Analyze the program and get access to the template type checker.
        const { templateTypeChecker, metaReader } = info.ngCompiler['ensureAnalyzed']();
        const { program: program$1, sourceFiles } = info;
        const checker$1 = program$1.getTypeChecker();
        const reflector = new checker.TypeScriptReflectionHost(checker$1);
        const evaluator = new program.PartialEvaluator(reflector, checker$1, null);
        const replacements = [];
        const importManager = new checker.ImportManager();
        const printer = ts__default["default"].createPrinter();
        const filesWithSourceQueries = new Map();
        const filesWithIncompleteMigration = new Map();
        const filesWithQueryListOutsideOfDeclarations = new WeakSet();
        const knownQueries = new KnownQueries(info, this.config, globalMetadata);
        const referenceResult = { references: [] };
        const sourceQueries = [];
        // Detect all queries in this unit.
        const queryWholeProgramVisitor = (node) => {
            // Detect all SOURCE queries and migrate them, if possible.
            const extractedQuery = extractSourceQueryDefinition(node, reflector, evaluator, info);
            if (extractedQuery !== null) {
                knownQueries.registerQueryField(extractedQuery.node, extractedQuery.id);
                sourceQueries.push(extractedQuery);
                return;
            }
            // Detect OTHER queries, inside `.d.ts`. Needed for reference resolution below.
            if (ts__default["default"].isPropertyDeclaration(node) ||
                (ts__default["default"].isAccessor(node) && ts__default["default"].isClassDeclaration(node.parent))) {
                const classFieldID = getUniqueIDForClassProperty(node, info);
                if (classFieldID !== null && globalMetadata.knownQueryFields[classFieldID] !== undefined) {
                    knownQueries.registerQueryField(node, classFieldID);
                    return;
                }
            }
            // Detect potential usages of `QueryList` outside of queries or imports.
            // Those prevent us from removing the import later.
            if (ts__default["default"].isIdentifier(node) &&
                node.text === 'QueryList' &&
                ts__default["default"].findAncestor(node, ts__default["default"].isImportDeclaration) === undefined) {
                filesWithQueryListOutsideOfDeclarations.add(node.getSourceFile());
            }
            ts__default["default"].forEachChild(node, queryWholeProgramVisitor);
        };
        this.config.reportProgressFn?.(40, 'Tracking query declarations..');
        for (const sf of info.fullProgramSourceFiles) {
            ts__default["default"].forEachChild(sf, queryWholeProgramVisitor);
        }
        // Set of all queries in the program. Useful for speeding up reference
        // lookups below.
        const fieldNamesToConsiderForReferenceLookup = new Set(Object.values(globalMetadata.knownQueryFields).map((f) => f.fieldName));
        // Find all references.
        const groupedAstVisitor = new migrate_ts_type_references.GroupedTsAstVisitor(sourceFiles);
        // Re-use previous reference result if available, instead of
        // looking for references which is quite expensive.
        if (globalMetadata.reusableAnalysisReferences !== null) {
            referenceResult.references = globalMetadata.reusableAnalysisReferences;
        }
        else {
            groupedAstVisitor.register(combine_units.createFindAllSourceFileReferencesVisitor(info, checker$1, reflector, info.ngCompiler['resourceManager'], evaluator, templateTypeChecker, knownQueries, fieldNamesToConsiderForReferenceLookup, referenceResult).visitor);
        }
        // Check inheritance.
        // NOTE: Inheritance is only checked in the migrate stage as we cannot reliably
        // check during analyze— where we don't know what fields from foreign `.d.ts`
        // files refer to queries or not.
        const inheritanceGraph = new migrate_ts_type_references.InheritanceGraph(checker$1).expensivePopulate(info.sourceFiles);
        migrate_ts_type_references.checkInheritanceOfKnownFields(inheritanceGraph, metaReader, knownQueries, {
            getFieldsForClass: (n) => knownQueries.getQueryFieldsOfClass(n) ?? [],
            isClassWithKnownFields: (clazz) => knownQueries.getQueryFieldsOfClass(clazz) !== undefined,
        });
        this.config.reportProgressFn?.(70, 'Checking inheritance..');
        groupedAstVisitor.execute();
        if (this.config.bestEffortMode) {
            filterBestEffortIncompatibilities(knownQueries);
        }
        this.config.reportProgressFn?.(80, 'Migrating queries..');
        // Migrate declarations.
        for (const extractedQuery of sourceQueries) {
            const node = extractedQuery.node;
            const sf = node.getSourceFile();
            const descriptor = { key: extractedQuery.id, node: extractedQuery.node };
            const incompatibility = knownQueries.getIncompatibilityForField(descriptor);
            updateFileState(filesWithSourceQueries, sf, extractedQuery.kind);
            if (incompatibility !== null) {
                // Add a TODO for the incompatible query, if desired.
                if (this.config.insertTodosForSkippedFields) {
                    replacements.push(...migrate_ts_type_references.insertTodoForIncompatibility(node, info, incompatibility, {
                        single: 'query',
                        plural: 'queries',
                    }));
                }
                updateFileState(filesWithIncompleteMigration, sf, extractedQuery.kind);
                continue;
            }
            replacements.push(...computeReplacementsToMigrateQuery(node, extractedQuery, importManager, info, printer, info.userOptions, checker$1));
        }
        // Migrate references.
        const referenceMigrationHost = {
            printer,
            replacements,
            shouldMigrateReferencesToField: (field) => !knownQueries.isFieldIncompatible(field),
            shouldMigrateReferencesToClass: (clazz) => !!knownQueries
                .getQueryFieldsOfClass(clazz)
                ?.some((q) => !knownQueries.isFieldIncompatible(q)),
        };
        migrate_ts_type_references.migrateTypeScriptReferences(referenceMigrationHost, referenceResult.references, checker$1, info);
        migrateTemplateReferences(referenceMigrationHost, referenceResult.references);
        migrateHostBindings(referenceMigrationHost, referenceResult.references, info);
        migrate_ts_type_references.migrateTypeScriptTypeReferences(referenceMigrationHost, referenceResult.references, importManager, info);
        // Fix problematic calls, like `QueryList#toArray`, or `QueryList#get`.
        for (const ref of referenceResult.references) {
            removeQueryListToArrayCall(ref, info, globalMetadata, knownQueries, replacements);
            replaceQueryListGetCall(ref, info, globalMetadata, knownQueries, replacements);
            replaceQueryListFirstAndLastReferences(ref, info, globalMetadata, knownQueries, replacements);
        }
        // Remove imports if possible.
        for (const [file, types] of filesWithSourceQueries) {
            let seenIncompatibleMultiQuery = false;
            for (const type of types) {
                const incompatibleQueryTypesForFile = filesWithIncompleteMigration.get(file);
                // Query type is fully migrated. No incompatible queries in file.
                if (!incompatibleQueryTypesForFile?.has(type)) {
                    importManager.removeImport(file, queryFunctionNameToDecorator(type), '@angular/core');
                }
                else if (type === 'viewChildren' || type === 'contentChildren') {
                    seenIncompatibleMultiQuery = true;
                }
            }
            if (!seenIncompatibleMultiQuery && !filesWithQueryListOutsideOfDeclarations.has(file)) {
                importManager.removeImport(file, 'QueryList', '@angular/core');
            }
        }
        combine_units.applyImportManagerChanges(importManager, replacements, sourceFiles, info);
        return { replacements, knownQueries };
    }
    async stats(globalMetadata) {
        let queriesCount = 0;
        let multiQueries = 0;
        let incompatibleQueries = 0;
        const fieldIncompatibleCounts = {};
        const classIncompatibleCounts = {};
        for (const query of Object.values(globalMetadata.knownQueryFields)) {
            queriesCount++;
            if (query.isMulti) {
                multiQueries++;
            }
        }
        for (const [id, info] of Object.entries(globalMetadata.problematicQueries)) {
            if (globalMetadata.knownQueryFields[id] === undefined) {
                continue;
            }
            incompatibleQueries++;
            if (info.classReason !== null) {
                const reasonName = migrate_ts_type_references.ClassIncompatibilityReason[info.classReason];
                const key = `incompat-class-${reasonName}`;
                classIncompatibleCounts[key] ??= 0;
                classIncompatibleCounts[key]++;
            }
            if (info.fieldReason !== null) {
                const reasonName = migrate_ts_type_references.FieldIncompatibilityReason[info.fieldReason];
                const key = `incompat-field-${reasonName}`;
                fieldIncompatibleCounts[key] ??= 0;
                fieldIncompatibleCounts[key]++;
            }
        }
        return {
            counters: {
                queriesCount,
                multiQueries,
                incompatibleQueries,
                ...fieldIncompatibleCounts,
                ...classIncompatibleCounts,
            },
        };
    }
}
/**
 * Updates the given map to capture the given query type.
 * The map may track migrated queries in a file, or query types
 * that couldn't be migrated.
 */
function updateFileState(stateMap, node, queryType) {
    const file = node.getSourceFile();
    if (!stateMap.has(file)) {
        stateMap.set(file, new Set());
    }
    stateMap.get(file).add(queryType);
}

function migrate(options) {
    return async (tree, context) => {
        const { buildPaths, testPaths } = await project_tsconfig_paths.getProjectTsConfigPaths(tree);
        if (!buildPaths.length && !testPaths.length) {
            throw new schematics.SchematicsException('Could not find any tsconfig file. Cannot run signal queries migration.');
        }
        const fs = new combine_units.DevkitMigrationFilesystem(tree);
        checker.setFileSystem(fs);
        const migration = new SignalQueriesMigration({
            bestEffortMode: options.bestEffortMode,
            insertTodosForSkippedFields: options.insertTodos,
            shouldMigrateQuery: (_query, file) => {
                return (file.rootRelativePath.startsWith(fs.normalize(options.path)) &&
                    !/(^|\/)node_modules\//.test(file.rootRelativePath));
            },
        });
        const analysisPath = fs.resolve(options.analysisDir);
        const unitResults = [];
        const programInfos = [...buildPaths, ...testPaths].map((tsconfigPath) => {
            context.logger.info(`Preparing analysis for: ${tsconfigPath}..`);
            const baseInfo = migration.createProgram(tsconfigPath, fs);
            const info = migration.prepareProgram(baseInfo);
            // Support restricting the analysis to subfolders for larger projects.
            if (analysisPath !== '/') {
                info.sourceFiles = info.sourceFiles.filter((sf) => sf.fileName.startsWith(analysisPath));
                info.fullProgramSourceFiles = info.fullProgramSourceFiles.filter((sf) => sf.fileName.startsWith(analysisPath));
            }
            return { info, tsconfigPath };
        });
        // Analyze phase. Treat all projects as compilation units as
        // this allows us to support references between those.
        for (const { info, tsconfigPath } of programInfos) {
            context.logger.info(`Scanning for queries: ${tsconfigPath}..`);
            unitResults.push(await migration.analyze(info));
        }
        context.logger.info(``);
        context.logger.info(`Processing analysis data between targets..`);
        context.logger.info(``);
        const combined = await combine_units.synchronouslyCombineUnitData(migration, unitResults);
        if (combined === null) {
            context.logger.error('Migration failed unexpectedly with no analysis data');
            return;
        }
        const globalMeta = await migration.globalMeta(combined);
        const replacementsPerFile = new Map();
        for (const { info, tsconfigPath } of programInfos) {
            context.logger.info(`Migrating: ${tsconfigPath}..`);
            const { replacements } = await migration.migrate(globalMeta, info);
            const changesPerFile = combine_units.groupReplacementsByFile(replacements);
            for (const [file, changes] of changesPerFile) {
                if (!replacementsPerFile.has(file)) {
                    replacementsPerFile.set(file, changes);
                }
            }
        }
        context.logger.info(`Applying changes..`);
        for (const [file, changes] of replacementsPerFile) {
            const recorder = tree.beginUpdate(file);
            for (const c of changes) {
                recorder
                    .remove(c.data.position, c.data.end - c.data.position)
                    .insertLeft(c.data.position, c.data.toInsert);
            }
            tree.commitUpdate(recorder);
        }
        context.logger.info('');
        context.logger.info(`Successfully migrated to signal queries 🎉`);
        const { counters: { queriesCount, incompatibleQueries, multiQueries }, } = await migration.stats(globalMeta);
        const migratedQueries = queriesCount - incompatibleQueries;
        context.logger.info('');
        context.logger.info(`Successfully migrated to signal queries 🎉`);
        context.logger.info(`  -> Migrated ${migratedQueries}/${queriesCount} queries.`);
        if (incompatibleQueries > 0 && !options.insertTodos) {
            context.logger.warn(`To see why ${incompatibleQueries} queries couldn't be migrated`);
            context.logger.warn(`consider re-running with "--insert-todos" or "--best-effort-mode".`);
        }
        if (options.bestEffortMode) {
            context.logger.warn(`You ran with best effort mode. Manually verify all code ` +
                `works as intended, and fix where necessary.`);
        }
    };
}

exports.migrate = migrate;