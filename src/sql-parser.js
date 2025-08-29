class SQLParser {
    constructor() {
        this.tables = new Map();
    }

    parseSQL(sqlContent, sourceName) {
        // Reset tables for this source
        this.tables.clear();
        
        // Remove comments and normalize whitespace
        const cleanSQL = this.cleanSQL(sqlContent);
        
        // Split into statements
        const statements = this.splitStatements(cleanSQL);
        
        // Parse CREATE TABLE statements
        statements.forEach(statement => {
            if (this.isCreateTableStatement(statement)) {
                this.parseCreateTable(statement, sourceName);
            }
        });
        
        return this.tables;
    }

    cleanSQL(sql) {
        // Remove single line comments
        sql = sql.replace(/--.*$/gm, '');
        
        // Remove multi-line comments
        sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Normalize whitespace
        sql = sql.replace(/\s+/g, ' ').trim();
        
        return sql;
    }

    splitStatements(sql) {
        // Split on semicolons, but be careful about semicolons in strings
        const statements = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];
            const prevChar = i > 0 ? sql[i - 1] : '';
            
            if (!inString && (char === "'" || char === '"' || char === '`')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
                inString = false;
                stringChar = '';
            }
            
            if (!inString && char === ';') {
                if (current.trim()) {
                    statements.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            statements.push(current.trim());
        }
        
        return statements;
    }

    isCreateTableStatement(statement) {
        return /^\s*CREATE\s+TABLE/i.test(statement);
    }

    parseCreateTable(statement, sourceName) {
        // Extract table name
        const tableNameMatch = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|(\w+))/i);
        if (!tableNameMatch) return;
        
        const tableName = tableNameMatch[1] || tableNameMatch[2];
        
        // Extract column definitions
        const columnsSection = this.extractColumnsSection(statement);
        if (!columnsSection) return;
        
        const columns = this.parseColumns(columnsSection);
        
        this.tables.set(tableName, {
            name: tableName,
            columns: columns,
            source: sourceName
        });
    }

    extractColumnsSection(statement) {
        // Find the opening parenthesis after table name
        const match = statement.match(/CREATE\s+TABLE\s+[^(]+\(\s*(.*)\s*\)(?:\s*[^;]*)?;?\s*$/is);
        return match ? match[1] : null;
    }

    parseColumns(columnsSection) {
        const columns = [];
        let currentColumn = '';
        let parenDepth = 0;
        let inString = false;
        let stringChar = '';
        
        // Split columns by commas, respecting parentheses and strings
        for (let i = 0; i < columnsSection.length; i++) {
            const char = columnsSection[i];
            const prevChar = i > 0 ? columnsSection[i - 1] : '';
            
            if (!inString && (char === "'" || char === '"' || char === '`')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
                inString = false;
                stringChar = '';
            }
            
            if (!inString) {
                if (char === '(') {
                    parenDepth++;
                } else if (char === ')') {
                    parenDepth--;
                }
            }
            
            if (!inString && parenDepth === 0 && char === ',') {
                if (currentColumn.trim()) {
                    const column = this.parseColumnDefinition(currentColumn.trim());
                    if (column) {
                        columns.push(column);
                    }
                }
                currentColumn = '';
            } else {
                currentColumn += char;
            }
        }
        
        // Handle last column
        if (currentColumn.trim()) {
            const column = this.parseColumnDefinition(currentColumn.trim());
            if (column) {
                columns.push(column);
            }
        }
        
        return columns;
    }

    parseColumnDefinition(definition) {
        // Skip constraints and keys
        if (this.isConstraintOrKey(definition)) {
            return null;
        }
        
        // Extract column name (first word, possibly quoted)
        const nameMatch = definition.match(/^(?:`([^`]+)`|(\w+))/);
        if (!nameMatch) return null;
        
        const columnName = nameMatch[1] || nameMatch[2];
        
        // Extract data type
        const typeMatch = definition.match(/\w+\s+([A-Z_]+(?:\([^)]+\))?)/i);
        const dataType = typeMatch ? typeMatch[1].toUpperCase() : 'UNKNOWN';
        
        // Check if nullable
        const isNotNull = /\bNOT\s+NULL\b/i.test(definition);
        const nullable = !isNotNull;
        
        // Extract default value
        const defaultMatch = definition.match(/\bDEFAULT\s+([^,\s]+(?:\s+[^,\s]+)*)/i);
        const defaultValue = defaultMatch ? defaultMatch[1].trim() : null;
        
        // Check for auto increment
        const autoIncrement = /\bAUTO_INCREMENT\b/i.test(definition);
        
        return {
            name: columnName,
            dataType: dataType,
            nullable: nullable,
            defaultValue: defaultValue,
            autoIncrement: autoIncrement,
            definition: definition
        };
    }

    isConstraintOrKey(definition) {
        const constraintKeywords = [
            'PRIMARY KEY',
            'FOREIGN KEY',
            'UNIQUE KEY',
            'KEY',
            'INDEX',
            'CONSTRAINT',
            'CHECK'
        ];
        
        const upperDef = definition.toUpperCase();
        return constraintKeywords.some(keyword => upperDef.startsWith(keyword));
    }

    static compareStructures(tables1, tables2) {
        const result = {
            missingTables: [],
            missingColumns: [],
            matchingTables: [],
            alterQueries: [],
            createTableQueries: []
        };

        // Convert maps to arrays for easier processing
        const tablesArray1 = Array.from(tables1.values());
        const tablesArray2 = Array.from(tables2.values());
        
        // Find missing tables (in tables1 but not in tables2)
        tablesArray1.forEach(table1 => {
            const matchingTable2 = tablesArray2.find(t2 => t2.name.toLowerCase() === table1.name.toLowerCase());
            if (!matchingTable2) {
                result.missingTables.push({
                    tableName: table1.name,
                    presentIn: 'Database 1',
                    missingFrom: 'Database 2',
                    columnCount: table1.columns.length,
                    table: table1
                });
                
                // Generate CREATE TABLE query
                result.createTableQueries.push(this.generateCreateTableQuery(table1));
            } else {
                result.matchingTables.push(table1.name);
                
                // Compare columns for matching tables
                table1.columns.forEach(col1 => {
                    const matchingCol2 = matchingTable2.columns.find(c2 => 
                        c2.name.toLowerCase() === col1.name.toLowerCase()
                    );
                    
                    if (!matchingCol2) {
                        result.missingColumns.push({
                            tableName: table1.name,
                            columnName: col1.name,
                            dataType: col1.dataType,
                            missingFrom: 'Database 2',
                            nullable: col1.nullable,
                            column: col1
                        });
                        
                        // Generate ALTER TABLE query
                        result.alterQueries.push(this.generateAddColumnQuery(table1.name, col1));
                    }
                });
            }
        });

        // Find missing tables (in tables2 but not in tables1)
        tablesArray2.forEach(table2 => {
            const matchingTable1 = tablesArray1.find(t1 => t1.name.toLowerCase() === table2.name.toLowerCase());
            if (!matchingTable1) {
                result.missingTables.push({
                    tableName: table2.name,
                    presentIn: 'Database 2',
                    missingFrom: 'Database 1',
                    columnCount: table2.columns.length,
                    table: table2
                });
                
                // Generate CREATE TABLE query
                result.createTableQueries.push(this.generateCreateTableQuery(table2));
            } else {
                // Compare columns for matching tables (reverse direction)
                table2.columns.forEach(col2 => {
                    const matchingCol1 = matchingTable1.columns.find(c1 => 
                        c1.name.toLowerCase() === col2.name.toLowerCase()
                    );
                    
                    if (!matchingCol1) {
                        result.missingColumns.push({
                            tableName: table2.name,
                            columnName: col2.name,
                            dataType: col2.dataType,
                            missingFrom: 'Database 1',
                            nullable: col2.nullable,
                            column: col2
                        });
                        
                        // Generate ALTER TABLE query
                        result.alterQueries.push(this.generateAddColumnQuery(table2.name, col2));
                    }
                });
            }
        });

        return result;
    }

    static generateAddColumnQuery(tableName, column) {
        let query = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${column.name}\` ${column.dataType}`;
        
        if (!column.nullable) {
            query += ' NOT NULL';
        }
        
        if (column.defaultValue !== null) {
            query += ` DEFAULT ${column.defaultValue}`;
        }
        
        if (column.autoIncrement) {
            query += ' AUTO_INCREMENT';
        }
        
        query += ';';
        return query;
    }

    static generateCreateTableQuery(table) {
        let query = `CREATE TABLE \`${table.name}\` (\n`;
        
        const columnDefinitions = table.columns.map(column => {
            let def = `  \`${column.name}\` ${column.dataType}`;
            
            if (!column.nullable) {
                def += ' NOT NULL';
            }
            
            if (column.defaultValue !== null) {
                def += ` DEFAULT ${column.defaultValue}`;
            }
            
            if (column.autoIncrement) {
                def += ' AUTO_INCREMENT';
            }
            
            return def;
        });
        
        query += columnDefinitions.join(',\n');
        query += '\n);';
        
        return query;
    }
}
