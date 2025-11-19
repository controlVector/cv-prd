/**
 * Python Parser
 * Extends BaseLanguageParser for Python files
 */

import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
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
 * Python-specific parser
 */
export class PythonParser extends BaseLanguageParser {
  constructor() {
    super({
      language: 'python',
      extensions: ['.py', '.pyw', '.pyi'],
      commentPatterns: {
        singleLine: ['#'],
        multiLineStart: ['"""', "'''"],
        multiLineEnd: ['"""', "'''"],
        docComment: ['"""', "'''"]
      }
    });
  }

  getLanguage(): string {
    return 'python';
  }

  getSupportedExtensions(): string[] {
    return this.config.extensions;
  }

  initialize(): void {
    const pyParser = new Parser();
    pyParser.setLanguage(Python);
    this.parser = pyParser;
  }

  /**
   * Extract symbols (functions, classes, methods)
   */
  extractSymbols(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];

    symbols.push(...this.extractFunctions(node, filePath, content));
    symbols.push(...this.extractClasses(node, filePath, content));

    return symbols;
  }

  /**
   * Extract function definitions
   */
  private extractFunctions(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const functions: SymbolNode[] = [];

    const functionNodes = this.findNodesByType(node, ['function_definition']);

    for (const funcNode of functionNodes) {
      const name = this.getFunctionName(funcNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const signature = this.getFunctionSignature(funcNode, content);
      const parameters = this.getFunctionParameters(funcNode);
      const docstring = this.getDocstring(funcNode, content);
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
        parameters,
        visibility: this.getFunctionVisibility(name),
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
   * Extract class definitions
   */
  private extractClasses(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const classes: SymbolNode[] = [];

    const classNodes = this.findNodesByType(node, ['class_definition']);

    for (const classNode of classNodes) {
      const name = this.getClassName(classNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(classNode, content);

      // Add class symbol
      classes.push({
        name,
        qualifiedName,
        kind: 'class',
        file: filePath,
        startLine: classNode.startPosition.row + 1,
        endLine: classNode.endPosition.row + 1,
        docstring,
        visibility: 'public',
        isAsync: false,
        isStatic: false,
        complexity: this.calculateComplexity(classNode),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Extract methods from class
      const methods = this.extractClassMethods(classNode, filePath, name, content);
      classes.push(...methods);
    }

    return classes;
  }

  /**
   * Extract methods from a class
   */
  private extractClassMethods(classNode: TreeSitterNode, filePath: string, className: string, content: string): SymbolNode[] {
    const methods: SymbolNode[] = [];

    const methodNodes = this.findNodesByType(classNode, ['function_definition']);

    for (const methodNode of methodNodes) {
      const name = this.getFunctionName(methodNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${className}.${name}`;
      const signature = this.getFunctionSignature(methodNode, content);
      const parameters = this.getFunctionParameters(methodNode);
      const docstring = this.getDocstring(methodNode, content);
      const isAsync = this.isAsyncFunction(methodNode);
      const isStatic = this.isStaticMethod(methodNode);
      const visibility = this.getMethodVisibility(name);

      methods.push({
        name,
        qualifiedName,
        kind: 'method',
        file: filePath,
        startLine: methodNode.startPosition.row + 1,
        endLine: methodNode.endPosition.row + 1,
        signature,
        docstring,
        parameters,
        visibility,
        isAsync,
        isStatic,
        complexity: this.calculateComplexity(methodNode),
        calls: this.extractCalls(methodNode),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return methods;
  }

  /**
   * Extract import statements
   */
  extractImports(node: TreeSitterNode, content: string): Import[] {
    const imports: Import[] = [];

    const importNodes = this.findNodesByType(node, ['import_statement', 'import_from_statement']);

    for (const importNode of importNodes) {
      if (importNode.type === 'import_statement') {
        // import module
        const moduleNode = importNode.childForFieldName('name');
        if (moduleNode) {
          imports.push({
            source: moduleNode.text,
            importedSymbols: [moduleNode.text],
            importType: 'namespace',
            isExternal: !moduleNode.text.startsWith('.'),
            packageName: moduleNode.text.split('.')[0],
            line: importNode.startPosition.row + 1
          });
        }
      } else if (importNode.type === 'import_from_statement') {
        // from module import symbol
        const moduleNode = importNode.childForFieldName('module_name');
        const source = moduleNode?.text || '';

        const importedSymbols: string[] = [];
        const nameNodes = this.findNodesByType(importNode, ['dotted_name', 'identifier']);
        for (const nameNode of nameNodes) {
          if (nameNode.text !== source) {
            importedSymbols.push(nameNode.text);
          }
        }

        imports.push({
          source,
          importedSymbols,
          importType: 'named',
          isExternal: !source.startsWith('.'),
          packageName: source.split('.')[0],
          line: importNode.startPosition.row + 1
        });
      }
    }

    return imports;
  }

  /**
   * Extract exports (Python doesn't have explicit exports, use __all__)
   */
  extractExports(node: TreeSitterNode): Export[] {
    const exports: Export[] = [];

    // Look for __all__ assignment
    const assignments = this.findNodesByType(node, ['assignment']);

    for (const assignment of assignments) {
      const leftNode = assignment.childForFieldName('left');
      if (leftNode?.text === '__all__') {
        const rightNode = assignment.childForFieldName('right');
        if (rightNode && (rightNode.type === 'list' || rightNode.type === 'tuple')) {
          const stringNodes = this.findNodesByType(rightNode, ['string']);
          for (const strNode of stringNodes) {
            const name = strNode.text.replace(/['"]/g, '');
            exports.push({
              name,
              type: 'named',
              line: assignment.startPosition.row + 1
            });
          }
        }
      }
    }

    return exports;
  }

  // ========== Python-specific Helper Methods ==========

  private getFunctionName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getClassName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getFunctionSignature(node: TreeSitterNode, content: string): string {
    const lines = content.split('\n');
    const startLine = node.startPosition.row;

    // Find the line with the colon (end of signature)
    let endLine = startLine;
    for (let i = startLine; i <= Math.min(node.endPosition.row, startLine + 5); i++) {
      if (lines[i].includes(':')) {
        endLine = i;
        break;
      }
    }

    return lines.slice(startLine, endLine + 1).join('\n').trim();
  }

  private getFunctionParameters(node: TreeSitterNode): Parameter[] {
    const parameters: Parameter[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (paramsNode) {
      const paramNodes = this.findNodesByType(paramsNode, ['identifier', 'typed_parameter', 'default_parameter']);

      for (const paramNode of paramNodes) {
        const name = paramNode.text.split(':')[0].split('=')[0].trim();

        // Skip 'self' and 'cls'
        if (name === 'self' || name === 'cls') continue;

        const typeMatch = paramNode.text.match(/:\s*([^=]+)/);
        const type = typeMatch ? typeMatch[1].trim() : undefined;

        const optional = paramNode.text.includes('=');

        parameters.push({
          name,
          type,
          optional
        });
      }
    }

    return parameters;
  }

  private isAsyncFunction(node: TreeSitterNode): boolean {
    // Check for 'async def'
    return node.text.trimStart().startsWith('async def');
  }

  private isStaticMethod(node: TreeSitterNode): boolean {
    // Look for @staticmethod decorator
    const parent = this.findParentNode(node);
    if (parent) {
      const decorators = this.findNodesByType(parent, ['decorator']);
      for (const decorator of decorators) {
        if (decorator.text.includes('staticmethod')) {
          return true;
        }
      }
    }
    return false;
  }

  private getFunctionVisibility(name: string): Visibility {
    // Python convention: __ prefix = private, _ prefix = protected
    if (name.startsWith('__') && !name.endsWith('__')) {
      return 'private';
    }
    if (name.startsWith('_')) {
      return 'protected';
    }
    return 'public';
  }

  private getMethodVisibility(name: string): Visibility {
    return this.getFunctionVisibility(name);
  }

  /**
   * Extract function calls
   */
  private extractCalls(node: TreeSitterNode): CallInfo[] {
    const calls: CallInfo[] = [];

    const callNodes = this.findNodesByType(node, ['call']);

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
    } else if (functionNode.type === 'attribute') {
      const attrNode = functionNode.childForFieldName('attribute');
      if (attrNode) {
        return attrNode.text;
      }
    }

    return null;
  }

  /**
   * Helper to find parent node (tree-sitter doesn't expose this directly)
   */
  private findParentNode(node: TreeSitterNode): TreeSitterNode | null {
    // This is a simplification - in practice, we'd need to traverse from root
    // For now, return null
    return null;
  }
}

/**
 * Create a Python parser instance
 */
export function createPythonParser(): PythonParser {
  const parser = new PythonParser();
  parser.initialize();
  return parser;
}
