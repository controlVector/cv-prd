/**
 * Java Parser
 * Extends BaseLanguageParser for Java files
 */

import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
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
 * Java-specific parser
 */
export class JavaParser extends BaseLanguageParser {
  constructor() {
    super({
      language: 'java',
      extensions: ['.java'],
      commentPatterns: {
        singleLine: ['//'],
        multiLineStart: ['/*'],
        multiLineEnd: ['*/'],
        docComment: ['/**']
      }
    });
  }

  getLanguage(): string {
    return 'java';
  }

  getSupportedExtensions(): string[] {
    return this.config.extensions;
  }

  initialize(): void {
    const javaParser = new Parser();
    javaParser.setLanguage(Java);
    this.parser = javaParser;
  }

  /**
   * Extract symbols (classes, interfaces, methods, constructors)
   */
  extractSymbols(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];

    symbols.push(...this.extractClasses(node, filePath, content));
    symbols.push(...this.extractInterfaces(node, filePath, content));
    symbols.push(...this.extractEnums(node, filePath, content));

    return symbols;
  }

  /**
   * Extract class declarations
   */
  private extractClasses(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const classes: SymbolNode[] = [];

    const classNodes = this.findNodesByType(node, ['class_declaration']);

    for (const classNode of classNodes) {
      const name = this.getClassName(classNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(classNode, content);
      const visibility = this.getVisibility(classNode);

      // Add class symbol
      classes.push({
        name,
        qualifiedName,
        kind: 'class',
        file: filePath,
        startLine: classNode.startPosition.row + 1,
        endLine: classNode.endPosition.row + 1,
        docstring,
        visibility,
        isAsync: false,
        isStatic: false,
        complexity: this.calculateComplexity(classNode),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Extract methods and constructors from class
      const methods = this.extractClassMethods(classNode, filePath, name, content);
      classes.push(...methods);
    }

    return classes;
  }

  /**
   * Extract interface declarations
   */
  private extractInterfaces(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const interfaces: SymbolNode[] = [];

    const interfaceNodes = this.findNodesByType(node, ['interface_declaration']);

    for (const intNode of interfaceNodes) {
      const name = this.getInterfaceName(intNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(intNode, content);
      const visibility = this.getVisibility(intNode);

      // Add interface symbol
      interfaces.push({
        name,
        qualifiedName,
        kind: 'interface',
        file: filePath,
        startLine: intNode.startPosition.row + 1,
        endLine: intNode.endPosition.row + 1,
        docstring,
        visibility,
        isAsync: false,
        isStatic: false,
        complexity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Extract methods from interface
      const methods = this.extractInterfaceMethods(intNode, filePath, name, content);
      interfaces.push(...methods);
    }

    return interfaces;
  }

  /**
   * Extract enum declarations
   */
  private extractEnums(node: TreeSitterNode, filePath: string, content: string): SymbolNode[] {
    const enums: SymbolNode[] = [];

    const enumNodes = this.findNodesByType(node, ['enum_declaration']);

    for (const enumNode of enumNodes) {
      const name = this.getEnumName(enumNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${name}`;
      const docstring = this.getDocstring(enumNode, content);
      const visibility = this.getVisibility(enumNode);

      enums.push({
        name,
        qualifiedName,
        kind: 'type',
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
   * Extract methods and constructors from a class
   */
  private extractClassMethods(classNode: TreeSitterNode, filePath: string, className: string, content: string): SymbolNode[] {
    const methods: SymbolNode[] = [];

    // Extract methods
    const methodNodes = this.findNodesByType(classNode, ['method_declaration']);

    for (const methodNode of methodNodes) {
      const name = this.getMethodName(methodNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${className}.${name}`;
      const signature = this.getMethodSignature(methodNode, content);
      const parameters = this.getMethodParameters(methodNode);
      const returnType = this.getReturnType(methodNode);
      const docstring = this.getDocstring(methodNode, content);
      const visibility = this.getVisibility(methodNode);
      const isStatic = this.isStatic(methodNode);

      methods.push({
        name,
        qualifiedName,
        kind: 'method',
        file: filePath,
        startLine: methodNode.startPosition.row + 1,
        endLine: methodNode.endPosition.row + 1,
        signature,
        docstring,
        returnType,
        parameters,
        visibility,
        isAsync: false, // Java doesn't have async/await
        isStatic,
        complexity: this.calculateComplexity(methodNode),
        calls: this.extractCalls(methodNode),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Extract constructors
    const constructorNodes = this.findNodesByType(classNode, ['constructor_declaration']);

    for (const constructorNode of constructorNodes) {
      const name = className; // Constructor name is class name
      const qualifiedName = `${filePath}:${className}.<init>`;
      const signature = this.getMethodSignature(constructorNode, content);
      const parameters = this.getMethodParameters(constructorNode);
      const docstring = this.getDocstring(constructorNode, content);
      const visibility = this.getVisibility(constructorNode);

      methods.push({
        name: `${name} (constructor)`,
        qualifiedName,
        kind: 'method',
        file: filePath,
        startLine: constructorNode.startPosition.row + 1,
        endLine: constructorNode.endPosition.row + 1,
        signature,
        docstring,
        parameters,
        visibility,
        isAsync: false,
        isStatic: false,
        complexity: this.calculateComplexity(constructorNode),
        calls: this.extractCalls(constructorNode),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return methods;
  }

  /**
   * Extract methods from an interface
   */
  private extractInterfaceMethods(interfaceNode: TreeSitterNode, filePath: string, interfaceName: string, content: string): SymbolNode[] {
    const methods: SymbolNode[] = [];

    const methodNodes = this.findNodesByType(interfaceNode, ['method_declaration']);

    for (const methodNode of methodNodes) {
      const name = this.getMethodName(methodNode);
      if (!name) continue;

      const qualifiedName = `${filePath}:${interfaceName}.${name}`;
      const signature = this.getMethodSignature(methodNode, content);
      const parameters = this.getMethodParameters(methodNode);
      const returnType = this.getReturnType(methodNode);
      const docstring = this.getDocstring(methodNode, content);

      methods.push({
        name,
        qualifiedName,
        kind: 'method',
        file: filePath,
        startLine: methodNode.startPosition.row + 1,
        endLine: methodNode.endPosition.row + 1,
        signature,
        docstring,
        returnType,
        parameters,
        visibility: 'public', // Interface methods are public by default
        isAsync: false,
        isStatic: false,
        complexity: 1, // Interface methods have no implementation
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

    const importNodes = this.findNodesByType(node, ['import_declaration']);

    for (const importNode of importNodes) {
      const source = this.getImportSource(importNode);
      if (!source) continue;

      const isStatic = importNode.text.includes('static');
      const isWildcard = source.endsWith('.*');

      const packageName = source.split('.')[0];
      const symbolName = isWildcard ? source : source.split('.').pop() || source;

      imports.push({
        source,
        importedSymbols: isWildcard ? [] : [symbolName],
        importType: isWildcard ? 'namespace' : 'named',
        isExternal: !source.startsWith('java.') && !source.startsWith('javax.'), // Simplified check
        packageName,
        line: importNode.startPosition.row + 1
      });
    }

    return imports;
  }

  /**
   * Extract exports (public classes, interfaces, enums)
   */
  extractExports(node: TreeSitterNode): Export[] {
    const exports: Export[] = [];

    // In Java, public top-level classes/interfaces/enums are exported
    const classNodes = this.findNodesByType(node, ['class_declaration']);
    const interfaceNodes = this.findNodesByType(node, ['interface_declaration']);
    const enumNodes = this.findNodesByType(node, ['enum_declaration']);

    for (const classNode of classNodes) {
      if (this.isPublic(classNode)) {
        const name = this.getClassName(classNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: classNode.startPosition.row + 1
          });
        }
      }
    }

    for (const intNode of interfaceNodes) {
      if (this.isPublic(intNode)) {
        const name = this.getInterfaceName(intNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: intNode.startPosition.row + 1
          });
        }
      }
    }

    for (const enumNode of enumNodes) {
      if (this.isPublic(enumNode)) {
        const name = this.getEnumName(enumNode);
        if (name) {
          exports.push({
            name,
            type: 'named',
            line: enumNode.startPosition.row + 1
          });
        }
      }
    }

    return exports;
  }

  // ========== Java-specific Helper Methods ==========

  private getClassName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getInterfaceName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getEnumName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getMethodName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text || null;
  }

  private getMethodSignature(node: TreeSitterNode, content: string): string {
    const lines = content.split('\n');
    const startLine = node.startPosition.row;

    // Find the line with the opening brace or semicolon
    let endLine = startLine;
    for (let i = startLine; i <= Math.min(node.endPosition.row, startLine + 3); i++) {
      if (lines[i].includes('{') || lines[i].includes(';')) {
        endLine = i;
        break;
      }
    }

    return lines.slice(startLine, endLine).join('\n').trim();
  }

  private getMethodParameters(node: TreeSitterNode): Parameter[] {
    const parameters: Parameter[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (paramsNode) {
      const paramNodes = this.findNodesByType(paramsNode, ['formal_parameter']);

      for (const paramNode of paramNodes) {
        const nameNode = paramNode.childForFieldName('name');
        const typeNode = paramNode.childForFieldName('type');

        if (nameNode && typeNode) {
          parameters.push({
            name: nameNode.text,
            type: typeNode.text,
            optional: false // Java doesn't have optional parameters
          });
        }
      }
    }

    return parameters;
  }

  private getReturnType(node: TreeSitterNode): string | undefined {
    const typeNode = node.childForFieldName('type');
    return typeNode?.text;
  }

  private isStatic(node: TreeSitterNode): boolean {
    // Check for 'static' modifier
    const modifiers = this.findNodesByType(node, ['modifiers']);
    for (const modifier of modifiers) {
      if (modifier.text.includes('static')) {
        return true;
      }
    }
    return false;
  }

  private isPublic(node: TreeSitterNode): boolean {
    // Check for 'public' modifier
    const modifiers = this.findNodesByType(node, ['modifiers']);
    for (const modifier of modifiers) {
      if (modifier.text.includes('public')) {
        return true;
      }
    }
    return false;
  }

  private getVisibility(node: TreeSitterNode): Visibility {
    // Check modifiers for visibility
    const modifiers = this.findNodesByType(node, ['modifiers']);

    for (const modifier of modifiers) {
      const text = modifier.text;
      if (text.includes('public')) return 'public';
      if (text.includes('private')) return 'private';
      if (text.includes('protected')) return 'protected';
    }

    // Default is package-private (we'll map to protected)
    return 'protected';
  }

  private getImportSource(node: TreeSitterNode): string | null {
    // Get the import path
    const children = node.children;
    for (const child of children) {
      if (child.type === 'scoped_identifier' || child.type === 'identifier') {
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

    const callNodes = this.findNodesByType(node, ['method_invocation']);

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
    const nameNode = callNode.childForFieldName('name');
    if (nameNode) {
      return nameNode.text;
    }

    // Check for object field
    const objectNode = callNode.childForFieldName('object');
    if (objectNode && objectNode.type === 'field_access') {
      const fieldNode = objectNode.childForFieldName('field');
      if (fieldNode) {
        return fieldNode.text;
      }
    }

    return null;
  }
}

/**
 * Create a Java parser instance
 */
export function createJavaParser(): JavaParser {
  const parser = new JavaParser();
  parser.initialize();
  return parser;
}
