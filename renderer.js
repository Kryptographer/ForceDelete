// DOM Elements
const folderPathInput = document.getElementById('folderPath');
const browseBtn = document.getElementById('browseBtn');
const deleteBtn = document.getElementById('deleteBtn');
const previewBtn = document.getElementById('previewBtn');
const progressBox = document.getElementById('progressBox');
const resultBox = document.getElementById('resultBox');
const resultContent = document.getElementById('resultContent');
const resultDetails = document.getElementById('resultDetails');
const statusText = document.getElementById('statusText');
const adminStatus = document.getElementById('adminStatus');
const dropZone = document.getElementById('dropZone');
const recentFoldersSection = document.getElementById('recentFoldersSection');
const recentList = document.getElementById('recentList');
const clearRecentBtn = document.getElementById('clearRecentBtn');
const toggleOptionsBtn = document.getElementById('toggleOptionsBtn');
const optionsContent = document.getElementById('optionsContent');
const dryRunMode = document.getElementById('dryRunMode');
const exclusionPatterns = document.getElementById('exclusionPatterns');
const previewResults = document.getElementById('previewResults');

let selectedFolder = null;

// Initialize app
(async () => {
    // Check admin status
    const result = await window.electronAPI.checkAdmin();
    if (result.isAdmin) {
        adminStatus.textContent = 'ADMIN: YES';
        adminStatus.style.color = '#00ff88';
    } else {
        adminStatus.textContent = 'ADMIN: NO';
        adminStatus.style.color = '#ff6b35';
    }
    updateStatus('READY');

    // Load recent folders
    await loadRecentFolders();

    // Load saved exclusion patterns
    const patterns = await window.electronAPI.getExclusionPatterns();
    if (patterns.length > 0) {
        exclusionPatterns.value = patterns.join('\n');
    }
})();

// Event listeners
browseBtn.addEventListener('click', selectFolder);
deleteBtn.addEventListener('click', deleteFolder);
previewBtn.addEventListener('click', previewFolder);
clearRecentBtn.addEventListener('click', clearRecentFolders);

toggleOptionsBtn.addEventListener('click', () => {
    const isHidden = optionsContent.style.display === 'none';
    optionsContent.style.display = isHidden ? 'block' : 'none';
    toggleOptionsBtn.textContent = isHidden ? 'Hide' : 'Show';
});

// Save exclusion patterns when changed
exclusionPatterns.addEventListener('change', async () => {
    const patterns = exclusionPatterns.value.split('\n').filter(p => p.trim());
    await window.electronAPI.saveExclusionPatterns(patterns);
});

// Drag and drop functionality
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const folderPath = files[0].path;
        setSelectedFolder(folderPath);
    }
});

// Also allow dropping on the entire content box
document.querySelector('.content-box').addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

document.querySelector('.content-box').addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !document.querySelector('.content-box').contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over');
    }
});

document.querySelector('.content-box').addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        setSelectedFolder(files[0].path);
    }
});

// Progress updates
window.electronAPI.onDeleteProgress((progress) => {
    updateDeleteProgress(progress);
});

// Functions
function updateStatus(message) {
    if (statusText) {
        statusText.textContent = message;
    }
}

function setSelectedFolder(folderPath) {
    selectedFolder = folderPath;
    folderPathInput.value = folderPath;
    deleteBtn.disabled = false;
    previewBtn.disabled = false;
    updateStatus('FOLDER SELECTED');
    previewResults.style.display = 'none';
    resultBox.style.display = 'none';
}

async function selectFolder() {
    try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            setSelectedFolder(folderPath);
        }
    } catch (error) {
        showResult('Error selecting folder: ' + error.message, 'error');
        updateStatus('ERROR');
    }
}

async function loadRecentFolders() {
    try {
        const folders = await window.electronAPI.getRecentFolders();
        if (folders.length > 0) {
            recentFoldersSection.style.display = 'block';
            recentList.innerHTML = '';
            folders.forEach(folder => {
                const item = document.createElement('div');
                item.className = 'recent-item';
                item.innerHTML = `
                    <span class="recent-path" title="${folder}">${shortenPath(folder)}</span>
                    <button class="recent-select">Select</button>
                `;
                item.querySelector('.recent-select').addEventListener('click', () => {
                    setSelectedFolder(folder);
                });
                item.querySelector('.recent-path').addEventListener('click', () => {
                    setSelectedFolder(folder);
                });
                recentList.appendChild(item);
            });
        } else {
            recentFoldersSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading recent folders:', error);
    }
}

function shortenPath(fullPath) {
    const maxLen = 50;
    if (fullPath.length <= maxLen) return fullPath;
    const parts = fullPath.split(/[/\\]/);
    if (parts.length <= 3) return fullPath;
    return parts[0] + '/.../' + parts.slice(-2).join('/');
}

async function clearRecentFolders() {
    await window.electronAPI.clearRecentFolders();
    recentFoldersSection.style.display = 'none';
    recentList.innerHTML = '';
}

function getExclusionPatterns() {
    return exclusionPatterns.value.split('\n').filter(p => p.trim());
}

async function previewFolder() {
    if (!selectedFolder) {
        showResult('No folder selected', 'error');
        return;
    }

    updateStatus('PREVIEWING...');
    previewBtn.disabled = true;
    deleteBtn.disabled = true;

    try {
        const patterns = getExclusionPatterns();
        const result = await window.electronAPI.previewDeletion(selectedFolder, patterns);

        if (result.success) {
            const preview = result.preview;
            document.getElementById('previewTotal').textContent = preview.total.toLocaleString();
            document.getElementById('previewDelete').textContent = preview.toDelete.toLocaleString();
            document.getElementById('previewExclude').textContent = preview.excluded.toLocaleString();

            // Show sample files
            const previewFiles = document.getElementById('previewFiles');
            previewFiles.innerHTML = '';

            if (preview.sampleFiles.length > 0) {
                const deleteSection = document.createElement('div');
                deleteSection.className = 'preview-section';
                deleteSection.innerHTML = `<h4>Files to delete (sample):</h4>`;
                preview.sampleFiles.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'preview-file delete';
                    item.textContent = shortenPath(file);
                    item.title = file;
                    deleteSection.appendChild(item);
                });
                if (preview.toDelete > 20) {
                    const more = document.createElement('div');
                    more.className = 'preview-more';
                    more.textContent = `... and ${preview.toDelete - 20} more files`;
                    deleteSection.appendChild(more);
                }
                previewFiles.appendChild(deleteSection);
            }

            if (preview.excludedFiles.length > 0) {
                const excludeSection = document.createElement('div');
                excludeSection.className = 'preview-section';
                excludeSection.innerHTML = `<h4>Excluded files (sample):</h4>`;
                preview.excludedFiles.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'preview-file exclude';
                    item.textContent = shortenPath(file);
                    item.title = file;
                    excludeSection.appendChild(item);
                });
                previewFiles.appendChild(excludeSection);
            }

            previewResults.style.display = 'block';
            updateStatus('PREVIEW COMPLETE');
        } else {
            showResult('Preview failed: ' + result.error, 'error');
            updateStatus('ERROR');
        }
    } catch (error) {
        showResult('Error: ' + error.message, 'error');
        updateStatus('ERROR');
    } finally {
        previewBtn.disabled = false;
        deleteBtn.disabled = false;
    }
}

async function deleteFolder() {
    if (!selectedFolder) {
        showResult('No folder selected', 'error');
        updateStatus('ERROR: NO FOLDER SELECTED');
        return;
    }

    const isDryRun = dryRunMode.checked;
    updateStatus('WAITING FOR CONFIRMATION');

    // Show confirmation dialog
    const actionText = isDryRun ? 'perform a dry run on' : 'permanently delete';
    const confirmed = await showConfirmDialog(
        isDryRun ? 'Confirm Dry Run' : 'Confirm Deletion',
        `Are you sure you want to ${actionText}:\n\n${selectedFolder}\n\n${isDryRun ? 'No files will be deleted in dry run mode.' : 'This action cannot be undone!'}`
    );

    if (!confirmed) {
        updateStatus('CANCELLED');
        return;
    }

    // Show progress
    updateStatus(isDryRun ? 'DRY RUN IN PROGRESS' : 'DELETING');
    progressBox.style.display = 'block';
    resultBox.style.display = 'none';
    previewResults.style.display = 'none';
    deleteBtn.disabled = true;
    previewBtn.disabled = true;
    browseBtn.disabled = true;

    try {
        const options = {
            dryRun: isDryRun,
            exclusionPatterns: getExclusionPatterns()
        };

        const result = await window.electronAPI.forceDeleteFolder(selectedFolder, options);

        if (result.success) {
            if (result.dryRun) {
                showResult(
                    `Dry run complete: Would delete ${result.wouldDelete || 0} items (${result.excluded || 0} excluded)`,
                    'success'
                );
                updateStatus('DRY RUN COMPLETE');
            } else {
                showResult(
                    `Successfully deleted ${result.deleted || 0} items (${result.failed || 0} failed, ${result.excluded || 0} excluded)`,
                    result.failed > 0 ? 'warning' : 'success'
                );
                updateStatus('DELETION COMPLETE');

                // Show log file location if available
                if (result.summary && result.summary.logFile) {
                    showResultDetails(`Log file: ${result.summary.logFile}`);
                }

                // Reset UI
                selectedFolder = null;
                folderPathInput.value = '';

                // Refresh recent folders
                await loadRecentFolders();
            }
        } else {
            showResult(`Error: ${result.error}`, 'error');
            updateStatus('ERROR: ' + result.error.toUpperCase());
        }
    } catch (error) {
        showResult('Error: ' + error.message, 'error');
        updateStatus('ERROR');
    } finally {
        progressBox.style.display = 'none';
        deleteBtn.disabled = !selectedFolder;
        previewBtn.disabled = !selectedFolder;
        browseBtn.disabled = false;
    }
}

function updateDeleteProgress(progress) {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');

    if (progressFill) {
        progressFill.style.width = progress.percent + '%';
    }

    if (progressText) {
        progressText.textContent = progress.message || 'PROCESSING...';
    }

    if (progressPercent) {
        progressPercent.textContent = progress.percent + '%';
    }

    updateStatus(`${progress.stage.toUpperCase()}: ${progress.percent}%`);
}

function showResult(message, type) {
    resultBox.style.display = 'block';
    resultDetails.style.display = 'none';
    resultContent.className = `result-content ${type}`;

    let icon = '?';
    if (type === 'success') icon = '✓';
    else if (type === 'error') icon = '✗';
    else if (type === 'warning') icon = '!';

    resultContent.innerHTML = `
        <span class="result-icon">${icon}</span>
        <span>${message}</span>
    `;
}

function showResultDetails(details) {
    resultDetails.style.display = 'block';
    resultDetails.innerHTML = `<small>${details}</small>`;
}

// Custom confirmation dialog
function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-header">
                <h3>${title}</h3>
            </div>
            <div class="modal-body">
                <p>${message.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-cancel">Cancel</button>
                <button class="btn btn-danger modal-confirm">${title.includes('Dry Run') ? 'Run Preview' : 'Delete'}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(() => overlay.classList.add('show'), 10);

        const cancelBtn = modal.querySelector('.modal-cancel');
        const confirmBtn = modal.querySelector('.modal-confirm');

        const close = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(overlay);
                resolve(result);
            }, 200);
        };

        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });

        // Keyboard support
        const handleKeydown = (e) => {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        };
        document.addEventListener('keydown', handleKeydown);

        confirmBtn.focus();
    });
}
