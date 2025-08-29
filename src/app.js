class SQompareApp {
    constructor() {
        this.file1Data = null;
        this.file2Data = null;
        this.parser1 = new SQLParser();
        this.parser2 = new SQLParser();
        this.comparisonResult = null;
        
        this.initializeEventListeners();
        this.initializeElectronEvents();
    }

    initializeEventListeners() {
        // File import buttons
        document.getElementById('browseFile1').addEventListener('click', () => {
            this.triggerFileImport(1);
        });
        
        document.getElementById('browseFile2').addEventListener('click', () => {
            this.triggerFileImport(2);
        });

        // Remove file buttons
        document.getElementById('removeFile1').addEventListener('click', () => {
            this.removeFile(1);
        });
        
        document.getElementById('removeFile2').addEventListener('click', () => {
            this.removeFile(2);
        });

        // Drag and drop
        this.setupDragAndDrop('dropZone1', 1);
        this.setupDragAndDrop('dropZone2', 2);

        // Compare button
        document.getElementById('compareBtn').addEventListener('click', () => {
            this.compareStructures();
        });

        // Clear all button
        document.getElementById('clearAll').addEventListener('click', () => {
            this.clearAll();
        });

        // Export report button
        document.getElementById('exportReport').addEventListener('click', () => {
            this.exportReport();
        });

        // Copy queries button
        document.getElementById('copyQueries').addEventListener('click', () => {
            this.copyQueries();
        });

        // Copy CREATE queries button
        document.getElementById('copyCreateQueries').addEventListener('click', () => {
            this.copyCreateQueries();
        });

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }

    initializeElectronEvents() {
        if (window.electronAPI) {
            // Listen for file imports from menu
            window.electronAPI.onSQLFileImported((event, data) => {
                this.handleFileImported(data);
            });

            // Listen for export report requests
            window.electronAPI.onExportReport((event, filePath) => {
                this.handleExportReport(filePath);
            });
        }
    }

    triggerFileImport(fileNumber) {
        // This would typically open a file dialog
        // For now, we'll create a hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sql';
        input.style.display = 'none';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFileSelected(file, fileNumber);
            }
            document.body.removeChild(input);
        });
        
        document.body.appendChild(input);
        input.click();
    }

    setupDragAndDrop(dropZoneId, fileNumber) {
        const dropZone = document.getElementById(dropZoneId);
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelected(files[0], fileNumber);
            }
        });
    }

    async handleFileSelected(file, fileNumber) {
        if (!file.name.toLowerCase().endsWith('.sql')) {
            this.showError('Please select a valid SQL file.');
            return;
        }

        try {
            const content = await this.readFile(file);
            const data = {
                fileNumber: fileNumber,
                fileName: file.name,
                filePath: file.path || file.name,
                content: content
            };
            
            this.handleFileImported(data);
        } catch (error) {
            this.showError(`Failed to read file: ${error.message}`);
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    handleFileImported(data) {
        const { fileNumber, fileName, filePath, content } = data;
        
        if (fileNumber === 1) {
            this.file1Data = { fileName, filePath, content };
            this.updateFileUI(1, fileName, content);
        } else {
            this.file2Data = { fileName, filePath, content };
            this.updateFileUI(2, fileName, content);
        }
        
        this.updateCompareButton();
    }

    updateFileUI(fileNumber, fileName, content) {
        const fileInfo = document.getElementById(`fileInfo${fileNumber}`);
        const dropZone = document.getElementById(`dropZone${fileNumber}`);
        const fileNameElement = document.getElementById(`fileName${fileNumber}`);
        const fileStatsElement = document.getElementById(`fileStats${fileNumber}`);
        const fileStatus = document.getElementById(`file${fileNumber}Status`);
        
        // Update file info
        fileNameElement.textContent = fileName;
        
        // Calculate stats
        const lines = content.split('\n').length;
        const size = new Blob([content]).size;
        const sizeStr = this.formatFileSize(size);
        fileStatsElement.textContent = `${lines} lines, ${sizeStr}`;
        
        // Update status
        fileStatus.textContent = 'File loaded';
        fileStatus.style.backgroundColor = '#d1fae5';
        fileStatus.style.color = '#065f46';
        
        // Show file info, hide drop zone
        dropZone.style.display = 'none';
        fileInfo.style.display = 'flex';
    }

    removeFile(fileNumber) {
        if (fileNumber === 1) {
            this.file1Data = null;
        } else {
            this.file2Data = null;
        }
        
        const fileInfo = document.getElementById(`fileInfo${fileNumber}`);
        const dropZone = document.getElementById(`dropZone${fileNumber}`);
        const fileStatus = document.getElementById(`file${fileNumber}Status`);
        
        // Reset UI
        fileInfo.style.display = 'none';
        dropZone.style.display = 'block';
        fileStatus.textContent = 'No file selected';
        fileStatus.style.backgroundColor = '#f1f5f9';
        fileStatus.style.color = '#64748b';
        
        this.updateCompareButton();
        this.hideResults();
    }

    updateCompareButton() {
        const compareBtn = document.getElementById('compareBtn');
        const hasData = this.file1Data && this.file2Data;
        
        compareBtn.disabled = !hasData;
        if (hasData) {
            compareBtn.innerHTML = '<i class="fas fa-code-compare"></i> Compare Structures';
        } else {
            compareBtn.innerHTML = '<i class="fas fa-code-compare"></i> Select both files to compare';
        }
    }

    async compareStructures() {
        if (!this.file1Data || !this.file2Data) {
            this.showError('Please select both SQL files before comparing.');
            return;
        }

        // Show loading
        this.showLoading(true);
        
        try {
            // Parse both SQL files
            const tables1 = this.parser1.parseSQL(this.file1Data.content, 'Database 1');
            const tables2 = this.parser2.parseSQL(this.file2Data.content, 'Database 2');
            
            // Compare structures
            this.comparisonResult = SQLParser.compareStructures(tables1, tables2);
            
            // Update UI with results
            this.displayResults(this.comparisonResult);
            
        } catch (error) {
            this.showError(`Failed to compare structures: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    displayResults(result) {
        // Show results section
        document.getElementById('resultsSection').style.display = 'block';
        
        // Update summary
        document.getElementById('missingTablesCount').textContent = result.missingTables.length;
        document.getElementById('missingColumnsCount').textContent = result.missingColumns.length;
        document.getElementById('matchingTablesCount').textContent = result.matchingTables.length;
        
        // Populate missing tables
        this.populateMissingTables(result.missingTables);
        
        // Populate missing columns
        this.populateMissingColumns(result.missingColumns);
        
        // Generate and display CREATE TABLE queries
        this.populateCreateTableQueries(result.createTableQueries);
        
        // Generate and display ALTER queries
        this.populateAlterQueries(result.alterQueries);
        
        // Scroll to results
        document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
    }

    populateMissingTables(missingTables) {
        const tbody = document.getElementById('missingTablesBody');
        tbody.innerHTML = '';
        
        if (missingTables.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b;">No missing tables found</td></tr>';
            return;
        }
        
        missingTables.forEach((table, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${table.tableName}</strong></td>
                <td><span class="badge ${table.presentIn === 'Database 1' ? 'badge-primary' : 'badge-secondary'}">${table.presentIn}</span></td>
                <td><span class="badge badge-warning">${table.missingFrom}</span></td>
                <td>${table.columnCount}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="app.viewTableStructure('${table.tableName}', ${index})" title="View Table Structure">
                        <i class="fas fa-eye"></i>
                        View
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    populateMissingColumns(missingColumns) {
        const tbody = document.getElementById('missingColumnsBody');
        tbody.innerHTML = '';
        
        if (missingColumns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b;">No missing columns found</td></tr>';
            return;
        }
        
        missingColumns.forEach(column => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${column.tableName}</strong></td>
                <td>${column.columnName}</td>
                <td><code>${column.dataType}</code></td>
                <td><span class="badge badge-warning">${column.missingFrom}</span></td>
                <td>${column.nullable ? 'Yes' : 'No'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    populateCreateTableQueries(queries) {
        const container = document.getElementById('createTablesContent');
        
        if (queries.length === 0) {
            container.textContent = '-- No missing tables found.\n-- All tables exist in both databases!';
            return;
        }
        
        const formattedQueries = queries.join('\n\n');
        container.textContent = formattedQueries;
    }

    populateAlterQueries(queries) {
        const container = document.getElementById('alterQueriesContent');
        
        if (queries.length === 0) {
            container.textContent = '-- No ALTER TABLE queries needed.\n-- All structures match!';
            return;
        }
        
        const formattedQueries = queries.join('\n\n');
        container.textContent = formattedQueries;
    }

    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
    }

    async copyCreateQueries() {
        if (!this.comparisonResult || this.comparisonResult.createTableQueries.length === 0) {
            this.showError('No CREATE TABLE queries to copy.');
            return;
        }
        
        const queries = this.comparisonResult.createTableQueries.join('\n\n');
        
        try {
            await navigator.clipboard.writeText(queries);
            
            // Visual feedback
            const btn = document.getElementById('copyCreateQueries');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.style.backgroundColor = '#10b981';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
            
        } catch (error) {
            this.showError('Failed to copy to clipboard.');
        }
    }

    async copyQueries() {
        if (!this.comparisonResult || this.comparisonResult.alterQueries.length === 0) {
            this.showError('No queries to copy.');
            return;
        }
        
        const queries = this.comparisonResult.alterQueries.join('\n\n');
        
        try {
            await navigator.clipboard.writeText(queries);
            
            // Visual feedback
            const btn = document.getElementById('copyQueries');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.style.backgroundColor = '#10b981';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.backgroundColor = '';
            }, 2000);
            
        } catch (error) {
            this.showError('Failed to copy to clipboard.');
        }
    }

    async exportReport() {
        if (!this.comparisonResult) {
            this.showError('No comparison results to export.');
            return;
        }
        
        // Trigger file save dialog through Electron
        if (window.electronAPI) {
            // This will be handled by the main process
            return;
        }
        
        // Fallback for web version
        const report = this.generateReport();
        this.downloadFile('sqompare-report.sql', report);
    }

    async handleExportReport(filePath) {
        if (!this.comparisonResult) {
            this.showError('No comparison results to export.');
            return;
        }
        
        try {
            const report = this.generateReport();
            
            if (window.electronAPI) {
                const result = await window.electronAPI.writeFile(filePath, report);
                if (result.success) {
                    this.showSuccess('Report exported successfully!');
                } else {
                    this.showError(`Failed to export report: ${result.error}`);
                }
            }
        } catch (error) {
            this.showError(`Failed to export report: ${error.message}`);
        }
    }

    generateReport() {
        const { missingTables, missingColumns, alterQueries, createTableQueries } = this.comparisonResult;
        const timestamp = new Date().toISOString();
        
        let report = `-- SQompare Database Structure Comparison Report\n`;
        report += `-- Generated on: ${timestamp}\n`;
        report += `-- Database 1: ${this.file1Data.fileName}\n`;
        report += `-- Database 2: ${this.file2Data.fileName}\n\n`;
        
        report += `-- SUMMARY:\n`;
        report += `-- Missing Tables: ${missingTables.length}\n`;
        report += `-- Missing Columns: ${missingColumns.length}\n`;
        report += `-- Matching Tables: ${this.comparisonResult.matchingTables.length}\n\n`;
        
        if (createTableQueries.length > 0) {
            report += `-- CREATE TABLE QUERIES FOR MISSING TABLES:\n`;
            report += `-- Execute these queries to create missing tables\n\n`;
            report += createTableQueries.join('\n\n');
            report += '\n\n';
        }
        
        if (alterQueries.length > 0) {
            report += `-- ALTER TABLE QUERIES TO ADD MISSING COLUMNS:\n`;
            report += `-- Execute these queries to add missing columns\n\n`;
            report += alterQueries.join('\n\n');
        } else {
            report += `-- No ALTER TABLE queries needed.\n`;
            report += `-- All column structures are in sync!\n`;
        }
        
        return report;
    }

    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    clearAll() {
        this.removeFile(1);
        this.removeFile(2);
        this.hideResults();
        this.comparisonResult = null;
    }

    hideResults() {
        document.getElementById('resultsSection').style.display = 'none';
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        if (window.electronAPI) {
            window.electronAPI.showErrorDialog('Error', message);
        } else {
            alert(`Error: ${message}`);
        }
    }

    showSuccess(message) {
        // Simple success notification - could be enhanced with a toast system
        console.log(`Success: ${message}`);
    }

    viewTableStructure(tableName, tableIndex) {
        const table = this.comparisonResult.missingTables[tableIndex];
        if (!table || !table.table) {
            this.showError('Table structure not available.');
            return;
        }
        
        // Create modal or detailed view
        const columns = table.table.columns;
        let structureHTML = `<div class="table-structure-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-table"></i> Table Structure: ${tableName}</h3>
                    <button class="modal-close" onclick="this.closest('.table-structure-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="table-container">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>Column Name</th>
                                    <th>Data Type</th>
                                    <th>Nullable</th>
                                    <th>Default</th>
                                    <th>Auto Increment</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        columns.forEach(col => {
            structureHTML += `
                <tr>
                    <td><strong>${col.name}</strong></td>
                    <td><code>${col.dataType}</code></td>
                    <td>${col.nullable ? 'Yes' : 'No'}</td>
                    <td>${col.defaultValue || '-'}</td>
                    <td>${col.autoIncrement ? 'Yes' : 'No'}</td>
                </tr>`;
        });
        
        structureHTML += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        
        // Add modal to body
        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = structureHTML;
        document.body.appendChild(modalDiv.firstElementChild);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SQompareApp();
});

// Add some basic badge styles
const badgeStyles = `
    .badge {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 500;
        border-radius: 0.375rem;
        text-align: center;
        white-space: nowrap;
    }
    .badge-primary {
        background-color: #dbeafe;
        color: #1e40af;
    }
    .badge-secondary {
        background-color: #f1f5f9;
        color: #475569;
    }
    .badge-warning {
        background-color: #fef3c7;
        color: #92400e;
    }
    .table-structure-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1001;
        backdrop-filter: blur(4px);
    }
    .modal-content {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        border: 1px solid var(--border-color);
        max-width: 90vw;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .modal-header {
        padding: 1.5rem;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .modal-header h3 {
        font-size: 1.125rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-primary);
        margin: 0;
    }
    .modal-close {
        background: none;
        border: none;
        font-size: 1.25rem;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.5rem;
        border-radius: var(--radius);
    }
    .modal-close:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
    }
    .modal-body {
        padding: 1.5rem;
        overflow-y: auto;
        flex: 1;
    }
`;

// Inject badge and modal styles
const styleSheet = document.createElement('style');
styleSheet.textContent = badgeStyles;
document.head.appendChild(styleSheet);
