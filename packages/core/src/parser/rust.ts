/**
 * Rust Parser
 * Extends BaseLanguageParser for Rust files
 */

import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';
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
 * Rust-specific parser
 */
export class RustParser extends BaseLanguageParser {
  constructor() {
    super({
      language: 'rust',
      extensions: ['.rs'],
      commentPatterns: {
        singleLine: ['//'],
        multiLineStart: ['/*'],
        multiLineEnd: ['*/'],
        docComment: ['///', '//!']
      }
    });
  }

  getLanguage(): string {
    return 'rust';
  }

  getSupportedExtensions(): string[] {
    return this.config.extensions;
  }

  initialize(): void {
    const rustParser = new Parser();
    rustParser.setLanguage(Rust);
    this.parser = rustParser;
  }

  /**
   * Extract symbols (functions, structs, enums, traits, impls)
   */
  extractSymbols(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];

    symbols.push(...this.extractFunctions(node, filePath, content));
    symbols.push(...this.extractStructs(node, filePath, content));
    symbols.push(...this.extractEnums(node, filePath, content));
    symbols.push(...this.extractTraits(node, filePath, content));
    symbols.push(...this.extractImpls(node, filePath, content));

    return symbols;
  }

  /**
   * Extract function declarations
   */
  private extractFunctions(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const functions: SymbolNode[] = [];

    const functionNodes = this.findNodesByType(node, ['function_item']);

    for (const funcNode of functionNodes) {
      const name = this.getFunctionName(funcNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const signature = this.getFunctionSignature(funcNode, content);
      const parameters = this.getFunctionParameters(funcNode);
      const returnType = this.getReturnType(funcNode);
      const docstring = this.getDocstring(funcNode, content);
      const visibility = this.getVisibility(funcNode);
      const isAsync = this.isAsyncFunction(funcNode);

      functions.push({
        name,
        qualifiedName,
        kind: 'function',
        file: filePath,
        startLine: funcNode.startPosition.row + 1,
        endLine: funcNode.endPosition.row + 1,
        signature,
        docstring,
        returnType,
        parameters,
        visibility,
        isAsync,
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
   * Extract struct declarations
   */
  private extractStructs(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const structs: SymbolNode[] = [];

    const structNodes = this.findNodesByType(node, ['struct_item']);

    for (const structNode of structNodes) {
      const name = this.getTypeName(structNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(structNode, content);
      const visibility = this.getVisibility(structNode);

      structs.push({
        name,
        qualifiedName,
        kind: 'struct',
        file: filePath,
        startLine: structNode.startPosition.row + 1,
        endLine: structNode.endPosition.row + 1,
        docstring,
        visibility,
        isAsync: false,
        isStatic: false,
        complexity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return structs;
  }

  /**
   * Extract enum declarations
   */
  private extractEnums(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const enums: SymbolNode[] = [];

    const enumNodes = this.findNodesByType(node, ['enum_item']);

    for (const enumNode of enumNodes) {
      const name = this.getTypeName(enumNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(enumNode, content);
      const visibility = this.getVisibility(enumNode);

      enums.push({
        name,
        qualifiedName,
        kind: 'type', // Use 'type' as enum kind
        file: filePath,
        startLine: enumNode.startPosition.row + 1,
        endLine: enumNode.endPosition.row + 1,
        docstring,
        visibility,
        isAsync: false,
        isStatic: false,
        complexity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return enums;
  }

  /**
   * Extract trait declarations
   */
  private extractTraits(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const traits: SymbolNode[] = [];

    const traitNodes = this.findNodesByType(node, ['trait_item']);

    for (const traitNode of traitNodes) {
      const name = this.getTypeName(traitNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(traitNode, content);
      const visibility = this.getVisibility(traitNode);

      traits.push({
        name,
        qualifiedName,
        kind: 'interface', // Traits are similar to interfaces
        file: filePath,
        startLine: traitNode.startPosition.row + 1,
        endLine: traitNode.endPosition.row + 1,
        docstring,
        visibility,
        isAsync: false,
        isStatic: false,
        complexity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return traits;
  }

  /**
   * Extract impl blocks (implementation methods)
   */
  private extractImpls(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const methods: SymbolNode[] = [];

    const implNodes = this.findNodesByType(node, ['impl_item']);

    for (const implNode of implNodes) {
      const typeName = this.getImplTypeName(implNode);
      if (!typeName) continue;

      // Extract methods from impl block
      const functionNodes = this.findNodesByType(implNode, ['function_item']);

      for (const funcNode of functionNodes) {
        const name = this.getFunctionName(funcNode);
        if (!name) continue;

        const qualifiedName = `${filePath}:${typeName}.${name}`;
        const signature = this.getFunctionSignature(funcNode, content);
        const parameters = this.getFunctionParameters(funcNode);
        const returnType = this.getReturnType(funcNode);
        const docstring = this.getDocstring(funcNode, content);
        const visibility = this.getVisibility(funcNode);
        const isAsync = this.isAsyncFunction(funcNode);

        methods.push({
          name,
          qualifiedName,
          kind: 'method',
          file: filePath,
          startLine: funcNode.startPosition.row + 1,
          endLine: funcNode.endPosition.row + 1,
          signature,
          docstring,
          returnType,
          parameters,
          visibility,
          isAsync,
          isStatic: false,
          complexity: this.calculateComplexity(funcNode),
          calls: this.extractCalls(funcNode),
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }

    return methods;
  }

  /**
   * Extract use statements (imports)
   */
  extractImports(node: TreeSitterNode, content: string): Import[] {
    const imports: Import[] = [];

    const useNodes = this.findNodesByType(node, ['use_declaration']);

    for (const useNode of useNodes) {
      const path = this.getUsePath(useNode);
      if (!path) continue;

      const source = path.replace(/::/g, '/');
      const isExternal = !source.startsWith('crate::') && !source.startsWith('self::') && !source.startsWith('super::');

      imports.push({
        source,
        importedSymbols: [path.split('::').pop() || path],
        importType: 'named',
        isExternal,
        packageName: source.split('/')[0],
        line: useNode.startPosition.row + 1
      });
    }

    return imports;
  }

  /**
   * Extract exports (pub items)
   */
  extractExports(node: TreeSitterNode): Export[] {
    const exports: Export[] = [];

    // In Rust, anything with 'pub' visibility is exported
    const functionNodes = this.findNodesByType(node, ['function_item']);
    const structNodes = this.findNodesByType(node, ['struct_item']);
    const enumNodes = this.findNodesByType(node, ['enum_item']);
    const traitNodes = this.findNodesByType(node, ['trait_item']);

    for (const funcNode of functionNodes) {
      if (this.isPublic(funcNode)) {
        const name = this.getFunctionName(funcNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: funcNode.startPosition.row + 1
          });
        }
      }
    }

    for (const structNode of structNodes) {
      if (this.isPublic(structNode)) {
        const name = this.getTypeName(structNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: structNode.startPosition.row + 1
          });
        }
      }
    }

    for (const enumNode of enumNodes) {
      if (this.isPublic(enumNode)) {
        const name = this.getTypeName(enumNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: enumNode.startPosition.row + 1
          });
        }
      }
    }

    for (const traitNode of traitNodes) {
      if (this.isPublic(traitNode)) {
        const name = this.getTypeName(traitNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: traitNode.startPosition.row + 1
          });
        }
      }
    }

    return exports;
  }

  // ========== Rust-specific Helper Methods ==========

  private getFunctionName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getTypeName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getImplTypeName(node: TreeSitterNode): string | null {
    const typeNode = node.childForFieldName('type');
    if (!typeNode) return null;

    // Handle generic types
    if (typeNode.type === 'generic_type') {
      const typeIdentifier = typeNode.childForFieldName('type');
      return typeIdentifier?.text || null;
    }

    return typeNode.text;
  }

  private getFunctionSignature(node: TreeSitterNode, content: string): string {
    const lines = content.split('\n');
    const startLine = node.startPosition.row;

    // Find the line with the opening brace or semicolon
    let endLine = startLine;
    for (let i = startLine; i <= Math.min(node.endPosition.row, startLine + 5); i++) {
      if (lines[i].includes('{') || lines[i].includes(';')) {
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
      const paramNodes = this.findNodesByType(paramsNode, ['parameter']);

      for (const paramNode of paramNodes) {
        const patternNode = paramNode.childForFieldName('pattern');
        const typeNode = paramNode.childForFieldName('type');

        if (patternNode) {
          // Handle self parameter
          if (patternNode.text === 'self' || patternNode.text === '&self' || patternNode.text === '&mut self') {
            continue;
          }

          parameters.push({
            name: patternNode.text,
            type: typeNode?.text,
            optional: false // Rust doesn't have optional parameters in the same way
          });
        }
      }
    }

    return parameters;
  }

  private getReturnType(node: TreeSitterNode): string | undefined {
    const returnTypeNode = node.childForFieldName('return_type');
    return returnTypeNode?.text;
  }

  private isAsyncFunction(node: TreeSitterNode): boolean {
    // Check for 'async' modifier
    const modifiers = this.findNodesByType(node, ['async']);
    return modifiers.length > 0;
  }

  private isPublic(node: TreeSitterNode): boolean {
    // Check for 'pub' visibility modifier
    const visibilityNode = node.childForFieldName('visibility');
    return visibilityNode !== null;
  }

  private getVisibility(node: TreeSitterNode): Visibility {
    const visibilityNode = node.childForFieldName('visibility');

    if (!visibilityNode) {
      return 'private'; // Default in Rust is private
    }

    const text = visibilityNode.text;
    if (text === 'pub') {
      return 'public';
    }
    if (text.startsWith('pub(crate)')) {
      return 'protected'; // Crate-level is similar to protected
    }

    return 'public';
  }

  private getUsePath(node: TreeSitterNode): string | null {
    // Get the use path text
    const children = node.children;
    for (const child of children) {
      if (child.type === 'use_clause' || child.type === 'scoped_identifier') {
        return child.text;
      }
    }
    return null;
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
    } else if (functionNode.type === 'field_expression') {
      const fieldNode = functionNode.childForFieldName('field');
      if (fieldNode) {
        return fieldNode.text;
      }
    } else if (functionNode.type === 'scoped_identifier') {
      // For paths like std::println
      const nameNode = functionNode.childForFieldName('name');
      if (nameNode) {
        return nameNode.text;
      }
    }

    return null;
  }
}

/**
 * Create a Rust parser instance
 */
export function createRustParser(): RustParser {
  const parser = new RustParser();
  parser.initialize();
  return parser;
}
