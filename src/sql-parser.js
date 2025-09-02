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
        
        // Extract table options (including collation)
        const tableOptions = this.parseTableOptions(statement);
        
        this.tables.set(tableName, {
            name: tableName,
            columns: columns,
            source: sourceName,
            collation: tableOptions.collation,
            charset: tableOptions.charset,
            engine: tableOptions.engine
        });
    }

    extractColumnsSection(statement) {
        // Find the opening parenthesis after table name
        const match = statement.match(/CREATE\s+TABLE\s+[^(]+\(\s*(.*)\s*\)(?:\s*[^;]*)?;?\s*$/is);
        return match ? match[1] : null;
    }

    parseTableOptions(statement) {
        const options = {
            collation: null,
            charset: null,
            engine: null
        };

        // Extract table options after the closing parenthesis
        const optionsMatch = statement.match(/\)\s*([^;]*)/i);
        if (!optionsMatch) return options;

        const optionsString = optionsMatch[1];

        // Extract ENGINE
        const engineMatch = optionsString.match(/ENGINE\s*=\s*([^\s,;]+)/i);
        if (engineMatch) {
            options.engine = engineMatch[1];
        }

        // Extract DEFAULT CHARSET
        const charsetMatch = optionsString.match(/(?:DEFAULT\s+)?(?:CHARACTER\s+SET|CHARSET)\s*=\s*([^\s,;]+)/i);
        if (charsetMatch) {
            options.charset = charsetMatch[1];
        }

        // Extract COLLATE
        const collateMatch = optionsString.match(/(?:DEFAULT\s+)?COLLATE\s*=\s*([^\s,;]+)/i);
        if (collateMatch) {
            options.collation = collateMatch[1];
        }

        return options;
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
        
        // Extract data type with improved regex to handle more complex types
        const typeMatch = definition.match(/(?:`[^`]+`|\w+)\s+([A-Z_]+(?:\([^)]+\))?(?:\s+(?:UNSIGNED|SIGNED|ZEROFILL))*)/i);
        let dataType = 'TEXT'; // Default fallback instead of 'UNKNOWN'
        
        if (typeMatch) {
            dataType = typeMatch[1].toUpperCase();
        } else {
            // Try alternative parsing for edge cases
            const altMatch = definition.match(/(?:`[^`]+`|\w+)\s+([A-Z_][A-Z0-9_]*)/i);
            if (altMatch) {
                dataType = altMatch[1].toUpperCase();
            }
        }
        
        // Check if nullable
        const isNotNull = /\bNOT\s+NULL\b/i.test(definition);
        const nullable = !isNotNull;
        
        // Extract default value
        const defaultMatch = definition.match(/\bDEFAULT\s+([^,\s]+(?:\s+[^,\s]+)*)/i);
        const defaultValue = defaultMatch ? defaultMatch[1].trim() : null;
        
        // Check for auto increment
        const autoIncrement = /\bAUTO_INCREMENT\b/i.test(definition);
        
        // Extract column-level charset
        const charsetMatch = definition.match(/\bCHARACTER\s+SET\s+([^\s,]+)/i);
        const charset = charsetMatch ? charsetMatch[1] : null;
        
        // Extract column-level collation
        const collateMatch = definition.match(/\bCOLLATE\s+([^\s,]+)/i);
        const collation = collateMatch ? collateMatch[1] : null;
        
        return {
            name: columnName,
            dataType: dataType,
            nullable: nullable,
            defaultValue: defaultValue,
            autoIncrement: autoIncrement,
            charset: charset,
            collation: collation,
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

    static compareStructures(tables1, tables2, includeCollation = true) {
        const result = {
            missingTables: [],
            missingColumns: [],
            differentColumns: [],
            matchingTables: [],
            alterQueries: [],
            modifyQueries: [],
            createTableQueries: []
        };

        // Maps to group columns by table for batched queries
        const addColumnsByTable = new Map();
        const modifyColumnsByTable = new Map();

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
                result.createTableQueries.push(this.generateCreateTableQuery(table1, includeCollation));
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
                        
                        // Group ADD columns by table for batched queries
                        if (!addColumnsByTable.has(table1.name)) {
                            addColumnsByTable.set(table1.name, {
                                table: table1,
                                columns: []
                            });
                        }
                        addColumnsByTable.get(table1.name).columns.push(col1);
                    } else {
                        // Check if columns are different (data type, nullable, collation, etc.)
                        if (this.areColumnsDifferent(col1, matchingCol2)) {
                            result.differentColumns.push({
                                tableName: table1.name,
                                columnName: col1.name,
                                sourceColumn: col1,
                                targetColumn: matchingCol2,
                                differences: this.getColumnDifferences(col1, matchingCol2)
                            });
                            
                            // Group MODIFY columns by table for batched queries
                            if (!modifyColumnsByTable.has(table1.name)) {
                                modifyColumnsByTable.set(table1.name, {
                                    table: table1,
                                    columns: []
                                });
                            }
                            modifyColumnsByTable.get(table1.name).columns.push(col1);
                        }
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
                result.createTableQueries.push(this.generateCreateTableQuery(table2, includeCollation));
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
                        
                        // Group ADD columns by table for batched queries
                        if (!addColumnsByTable.has(table2.name)) {
                            addColumnsByTable.set(table2.name, {
                                table: table2,
                                columns: []
                            });
                        }
                        addColumnsByTable.get(table2.name).columns.push(col2);
                    }
                });
            }
        });

        // Generate grouped ADD column queries
        for (const [tableName, tableData] of addColumnsByTable) {
            result.alterQueries.push(this.generateGroupedAddColumnQuery(tableName, tableData.columns, tableData.table, includeCollation));
        }

        // Generate grouped MODIFY column queries
        for (const [tableName, tableData] of modifyColumnsByTable) {
            result.modifyQueries.push(this.generateGroupedModifyColumnQuery(tableName, tableData.columns, tableData.table, includeCollation));
        }

        return result;
    }

    static generateAddColumnQuery(tableName, column, sourceTable = null, includeCollation = true) {
        let query = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${column.name}\` ${column.dataType}`;
        
        // Add column-level charset if specified and includeCollation is true
        if (includeCollation && column.charset) {
            query += ` CHARACTER SET ${column.charset}`;
        }
        
        // Add column-level collation if specified and includeCollation is true
        if (includeCollation && column.collation) {
            query += ` COLLATE ${column.collation}`;
        } else if (includeCollation && sourceTable && sourceTable.collation) {
            // If no column-level collation, use table collation for text-based columns
            const textTypes = ['VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT'];
            const columnBaseType = column.dataType.split('(')[0].toUpperCase();
            
            if (textTypes.includes(columnBaseType)) {
                query += ` COLLATE ${sourceTable.collation}`;
            }
        }
        
        if (column.nullable) {
            query += ' NULL';
        } else {
            query += ' NOT NULL';
        }
        
        if (column.defaultValue !== null) {
            query += ` DEFAULT ${column.defaultValue}`;
        }
        
        if (column.autoIncrement) {
            query += ' AUTO_INCREMENT';
        }
        
        // Add AFTER clause to place column after the last existing column
        if (sourceTable && sourceTable.columns && sourceTable.columns.length > 0) {
            const lastColumnName = sourceTable.columns[sourceTable.columns.length - 1].name;
            query += ` AFTER \`${lastColumnName}\``;
        }
        
        query += ';';
        return query;
    }

    static generateGroupedAddColumnQuery(tableName, columns, sourceTable = null, includeCollation = true) {
        if (columns.length === 0) return '';
        
        let query = `ALTER TABLE \`${tableName}\``;
        const columnDefinitions = [];
        
        // Get the last column name from the source table for AFTER clause
        let lastColumnName = null;
        if (sourceTable && sourceTable.columns && sourceTable.columns.length > 0) {
            lastColumnName = sourceTable.columns[sourceTable.columns.length - 1].name;
        }
        
        columns.forEach((column, index) => {
            let def = `ADD COLUMN \`${column.name}\` ${column.dataType}`;
            
            // Add column-level charset if specified and includeCollation is true
            if (includeCollation && column.charset) {
                def += ` CHARACTER SET ${column.charset}`;
            }
            
            // Add column-level collation if specified and includeCollation is true
            if (includeCollation && column.collation) {
                def += ` COLLATE ${column.collation}`;
            } else if (includeCollation && sourceTable && sourceTable.collation) {
                // If no column-level collation, use table collation for text-based columns
                const textTypes = ['VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT'];
                const columnBaseType = column.dataType.split('(')[0].toUpperCase();
                
                if (textTypes.includes(columnBaseType)) {
                    def += ` COLLATE ${sourceTable.collation}`;
                }
            }
            
            // Handle nullable - be explicit about NULL vs NOT NULL
            if (column.nullable) {
                def += ' NULL';
            } else {
                def += ' NOT NULL';
            }
            
            if (column.defaultValue !== null) {
                def += ` DEFAULT ${column.defaultValue}`;
            }
            
            if (column.autoIncrement) {
                def += ' AUTO_INCREMENT';
            }
            
            // Add AFTER clause - for first column, add after last existing column
            // For subsequent columns in the same ALTER statement, add after the previous column being added
            if (index === 0 && lastColumnName) {
                def += ` AFTER \`${lastColumnName}\``;
            } else if (index > 0) {
                def += ` AFTER \`${columns[index - 1].name}\``;
            }
            
            columnDefinitions.push(def);
        });
        
        query += '\n  ' + columnDefinitions.join(',\n  ') + ';';
        return query;
    }

    static generateGroupedModifyColumnQuery(tableName, columns, sourceTable = null, includeCollation = true) {
        if (columns.length === 0) return '';
        
        let query = `ALTER TABLE \`${tableName}\``;
        const columnDefinitions = [];
        
        columns.forEach(column => {
            let def = `MODIFY COLUMN \`${column.name}\` ${column.dataType}`;
            
            // Add column-level charset if specified and includeCollation is true
            if (includeCollation && column.charset) {
                def += ` CHARACTER SET ${column.charset}`;
            }
            
            // Add column-level collation if specified and includeCollation is true
            if (includeCollation && column.collation) {
                def += ` COLLATE ${column.collation}`;
            } else if (includeCollation && sourceTable && sourceTable.collation) {
                // If no column-level collation, use table collation for text-based columns
                const textTypes = ['VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT'];
                const columnBaseType = column.dataType.split('(')[0].toUpperCase();
                
                if (textTypes.includes(columnBaseType)) {
                    def += ` COLLATE ${sourceTable.collation}`;
                }
            }
            
            // Handle nullable - be explicit about NULL vs NOT NULL
            if (column.nullable) {
                def += ' NULL';
            } else {
                def += ' NOT NULL';
            }
            
            if (column.defaultValue !== null) {
                def += ` DEFAULT ${column.defaultValue}`;
            }
            
            if (column.autoIncrement) {
                def += ' AUTO_INCREMENT';
            }
            
            columnDefinitions.push(def);
        });
        
        query += '\n  ' + columnDefinitions.join(',\n  ') + ';';
        return query;
    }

    static areColumnsDifferent(col1, col2) {
        // Compare key properties that would require ALTER TABLE MODIFY
        return (
            col1.dataType !== col2.dataType ||
            col1.nullable !== col2.nullable ||
            col1.defaultValue !== col2.defaultValue ||
            col1.autoIncrement !== col2.autoIncrement ||
            col1.charset !== col2.charset ||
            col1.collation !== col2.collation
        );
    }

    static getColumnDifferences(col1, col2) {
        const differences = [];
        
        if (col1.dataType !== col2.dataType) {
            differences.push(`Data type: ${col1.dataType} vs ${col2.dataType}`);
        }
        if (col1.nullable !== col2.nullable) {
            differences.push(`Nullable: ${col1.nullable ? 'YES' : 'NO'} vs ${col2.nullable ? 'YES' : 'NO'}`);
        }
        if (col1.defaultValue !== col2.defaultValue) {
            differences.push(`Default: ${col1.defaultValue || 'NULL'} vs ${col2.defaultValue || 'NULL'}`);
        }
        if (col1.autoIncrement !== col2.autoIncrement) {
            differences.push(`Auto increment: ${col1.autoIncrement ? 'YES' : 'NO'} vs ${col2.autoIncrement ? 'YES' : 'NO'}`);
        }
        if (col1.charset !== col2.charset) {
            differences.push(`Charset: ${col1.charset || 'default'} vs ${col2.charset || 'default'}`);
        }
        if (col1.collation !== col2.collation) {
            differences.push(`Collation: ${col1.collation || 'default'} vs ${col2.collation || 'default'}`);
        }
        
        return differences;
    }

    static generateModifyColumnQuery(tableName, column, sourceTable = null, includeCollation = true) {
        let query = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${column.name}\` ${column.dataType}`;
        
        // Add column-level charset if specified and includeCollation is true
        if (includeCollation && column.charset) {
            query += ` CHARACTER SET ${column.charset}`;
        }
        
        // Add column-level collation if specified and includeCollation is true
        if (includeCollation && column.collation) {
            query += ` COLLATE ${column.collation}`;
        } else if (includeCollation && sourceTable && sourceTable.collation) {
            // If no column-level collation, use table collation for text-based columns
            const textTypes = ['VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT'];
            const columnBaseType = column.dataType.split('(')[0].toUpperCase();
            
            if (textTypes.includes(columnBaseType)) {
                query += ` COLLATE ${sourceTable.collation}`;
            }
        }
        
        // Handle nullable - be explicit about NULL vs NOT NULL
        if (column.nullable) {
            query += ' NULL';
        } else {
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

    static generateCreateTableQuery(table, includeCollation = true) {
        let query = `CREATE TABLE \`${table.name}\` (\n`;
        
        const columnDefinitions = table.columns.map(column => {
            let def = `  \`${column.name}\` ${column.dataType}`;
            
            // Add column-level charset if specified and includeCollation is true
            if (includeCollation && column.charset) {
                def += ` CHARACTER SET ${column.charset}`;
            }
            
            // Add column-level collation if specified and includeCollation is true
            if (includeCollation && column.collation) {
                def += ` COLLATE ${column.collation}`;
            }
            
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
        query += '\n)';
        
        // Add table options
        if (table.engine) {
            query += ` ENGINE=${table.engine}`;
        }
        
        if (table.charset) {
            query += ` DEFAULT CHARSET=${table.charset}`;
        }
        
        if (includeCollation && table.collation) {
            query += ` COLLATE=${table.collation}`;
        }
        
        query += ';';
        
        return query;
    }
}
