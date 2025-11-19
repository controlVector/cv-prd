/**
 * Go Parser
 * Extends BaseLanguageParser for Go files
 */

import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import { BaseLanguageParser, TreeSitterNode } from './base.js';
import {
  SymbolNode,
  Import,
  Export,
  Parameter,
  CallInfo,
  Visibility
} from '@cv-git/shared';

/**
 * Go-specific parser
 */
export class GoParser extends BaseLanguageParser {
  constructor() {
    super({
      language: 'go',
      extensions: ['.go'],
      commentPatterns: {
        singleLine: ['//'],
        multiLineStart: ['/*'],
        multiLineEnd: ['*/'],
        docComment: ['//']
      }
    });
  }

  getLanguage(): string {
    return 'go';
  }

  getSupportedExtensions(): string[] {
    return this.config.extensions;
  }

  initialize(): void {
    const goParser = new Parser();
    goParser.setLanguage(Go);
    this.parser = goParser;
  }

  /**
   * Extract symbols (functions, methods, types, structs)
   */
  extractSymbols(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];

    symbols.push(...this.extractFunctions(node, filePath, content));
    symbols.push(...this.extractTypes(node, filePath, content));

    return symbols;
  }

  /**
   * Extract function declarations
   */
  private extractFunctions(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const functions: SymbolNode[] = [];

    const functionNodes = this.findNodesByType(node, ['function_declaration', 'method_declaration']);

    for (const funcNode of functionNodes) {
      const name = this.getFunctionName(funcNode);
      if (!name) continue;

      const isMethod = funcNode.type === 'method_declaration';
      const receiverType = isMethod ? this.getReceiverType(funcNode) : null;

      const qualifiedName = receiverType
        ? `${filePath}:${receiverType}.${name}`
        : `${filePath}:${name}`;

      const signature = this.getFunctionSignature(funcNode, content);
      const parameters = this.getFunctionParameters(funcNode);
      const returnType = this.getReturnType(funcNode);
      const docstring = this.getDocstring(funcNode, content);
      const visibility = this.getVisibility(name);

      functions.push({
        name,
        qualifiedName,
        kind: isMethod ? 'method' : 'function',
        file: filePath,
        startLine: funcNode.startPosition.row + 1,
        endLine: funcNode.endPosition.row + 1,
        signature,
        docstring,
        returnType,
        parameters,
        visibility,
        isAsync: false, // Go doesn't have async/await
        isStatic: false,
        complexity: this.calculateComplexity(funcNode),
        calls: this.extractCalls(funcNode),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return functions;
  }

  /**
   * Extract type declarations (structs, interfaces)
   */
  private extractTypes(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const types: SymbolNode[] = [];

    const typeNodes = this.findNodesByType(node, ['type_declaration']);

    for (const typeNode of typeNodes) {
      const specs = this.findNodesByType(typeNode, ['type_spec']);

      for (const spec of specs) {
        const name = this.getTypeName(spec);
        if (!name) continue;

        const qualifiedName = `${filePath}:${name}`;
        const typeValue = spec.childForFieldName('type');
        const kind = this.determineTypeKind(typeValue);
        const docstring = this.getDocstring(typeNode, content);
        const visibility = this.getVisibility(name);

        types.push({
          name,
          qualifiedName,
          kind,
          file: filePath,
          startLine: spec.startPosition.row + 1,
          endLine: spec.endPosition.row + 1,
          docstring,
          visibility,
          isAsync: false,
          isStatic: false,
          complexity: 1,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }

    return types;
  }

  /**
   * Extract import statements
   */
  extractImports(node: TreeSitterNode, content: string): Import[] {
    const imports: Import[] = [];

    const importNodes = this.findNodesByType(node, ['import_declaration']);

    for (const importNode of importNodes) {
      const specs = this.findNodesByType(importNode, ['import_spec']);

      for (const spec of specs) {
        const pathNode = spec.childForFieldName('path');
        if (!pathNode) continue;

        const source = pathNode.text.replace(/"/g, '');
        const nameNode = spec.childForFieldName('name');
        const alias = nameNode?.text;

        imports.push({
          source,
          importedSymbols: alias ? [alias] : [],
          importType: 'namespace',
          isExternal: !source.startsWith('.'),
          packageName: source.split('/').pop() || source,
          line: spec.startPosition.row + 1
        });
      }
    }

    return imports;
  }

  /**
   * Extract exports (Go exports based on capitalization)
   */
  extractExports(node: TreeSitterNode): Export[] {
    const exports: Export[] = [];

    // In Go, any identifier starting with uppercase is exported
    // We'll export all public functions and types
    const functionNodes = this.findNodesByType(node, ['function_declaration']);
    const typeNodes = this.findNodesByType(node, ['type_spec']);

    for (const funcNode of functionNodes) {
      const name = this.getFunctionName(funcNode);
      if (name && this.isExported(name)) {
        exports.push({
          name,
          type: 'named',
          line: funcNode.startPosition.row + 1
        });
      }
    }

    for (const typeNode of typeNodes) {
      const name = this.getTypeName(typeNode);
      if (name && this.isExported(name)) {
        exports.push({
          name,
          type: 'named',
          line: typeNode.startPosition.row + 1
        });
      }
    }

    return exports;
  }

  // ========== Go-specific Helper Methods ==========

  private getFunctionName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getTypeName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getReceiverType(node: TreeSitterNode): string | null {
    const receiverNode = node.childForFieldName('receiver');
    if (!receiverNode) return null;

    const typeNode = this.findNodesByType(receiverNode, ['type_identifier', 'pointer_type'])[0];
    if (typeNode) {
      return typeNode.text.replace('*', ''); // Remove pointer marker
    }

    return null;
  }

  private getFunctionSignature(node: TreeSitterNode, content: string): string {
    const lines = content.split('\n');
    const startLine = node.startPosition.row;

    // Find the line with the opening brace
    let endLine = startLine;
    for (let i = startLine; i <= Math.min(node.endPosition.row, startLine + 5); i++) {
      if (lines[i].includes('{')) {
        endLine = i;
        break;
      }
    }

    return lines.slice(startLine, endLine).join('\n').trim();
  }

  private getFunctionParameters(node: TreeSitterNode): Parameter[] {
    const parameters: Parameter[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (paramsNode) {
      const paramNodes = this.findNodesByType(paramsNode, ['parameter_declaration']);

      for (const paramNode of paramNodes) {
        const nameNode = paramNode.childForFieldName('name');
        const typeNode = paramNode.childForFieldName('type');

        if (nameNode && typeNode) {
          parameters.push({
            name: nameNode.text,
            type: typeNode.text,
            optional: false // Go doesn't have optional parameters
          });
        }
      }
    }

    return parameters;
  }

  private getReturnType(node: TreeSitterNode): string | undefined {
    const resultNode = node.childForFieldName('result');
    return resultNode?.text;
  }

  private determineTypeKind(typeNode: TreeSitterNode | null): 'class' | 'interface' | 'struct' | 'type' {
    if (!typeNode) return 'type';

    const typeText = typeNode.type;
    if (typeText === 'struct_type') return 'struct';
    if (typeText === 'interface_type') return 'interface';
    return 'type';
  }

  private isExported(name: string): boolean {
    // In Go, exported names start with uppercase letter
    return name.length > 0 && name[0] === name[0].toUpperCase();
  }

  private getVisibility(name: string): Visibility {
    // In Go, uppercase = public, lowercase = private
    return this.isExported(name) ? 'public' : 'private';
  }

  /**
   * Extract function calls
   */
  private extractCalls(node: TreeSitterNode): CallInfo[] {
    const calls: CallInfo[] = [];

    const callNodes = this.findNodesByType(node, ['call_expression']);

    for (const callNode of callNodes) {
      const calleeName = this.getCalleeName(callNode);
      if (!calleeName) continue;

      const isConditional = this.isInsideConditional(callNode, node);

      calls.push({
        callee: calleeName,
        line: callNode.startPosition.row + 1,
        isConditional
      });
    }

    return calls;
  }

  private getCalleeName(callNode: TreeSitterNode): string | null {
    const functionNode = callNode.childForFieldName('function');
    if (!functionNode) return null;

    if (functionNode.type === 'identifier') {
      return functionNode.text;
    } else if (functionNode.type === 'selector_expression') {
      const fieldNode = functionNode.childForFieldName('field');
      if (fieldNode) {
        return fieldNode.text;
      }
    }

    return null;
  }
}

/**
 * Create a Go parser instance
 */
export function createGoParser(): GoParser {
  const parser = new GoParser();
  parser.initialize();
  return parser;
}
