const folderPathInput = document.getElementById('folderPath');
const browseBtn = document.getElementById('browseBtn');
const deleteBtn = document.getElementById('deleteBtn');
const folderInfo = document.getElementById('folderInfo');
const warningBox = document.getElementById('warningBox');
const progressBox = document.getElementById('progressBox');
const resultBox = document.getElementById('resultBox');
const resultContent = document.getElementById('resultContent');
const statusText = document.getElementById('statusText');
const adminStatus = document.getElementById('adminStatus');

let selectedFolder = null;

// Check admin status on load
(async () => {
    const result = await window.electronAPI.checkAdmin();
    if (result.isAdmin) {
        adminStatus.textContent = 'ADMIN: YES';
        adminStatus.style.color = '#00ff88';
        updateStatus('READY');
    } else {
        adminStatus.textContent = 'ADMIN: NO';
        adminStatus.style.color = '#ff6b35';
        updateStatus('READY');
    }
})();

// Event listeners
browseBtn.addEventListener('click', selectFolder);
deleteBtn.addEventListener('click', () => {
    console.log('Delete button clicked!');
    deleteFolder();
});

// Listen for deletion progress updates
window.electronAPI.onDeleteProgress((progress) => {
    updateDeleteProgress(progress);
});

function updateStatus(message) {
    if (statusText) {
        statusText.textContent = message;
    }
}

async function selectFolder() {
    try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            selectedFolder = folderPath;
            folderPathInput.value = folderPath;
            deleteBtn.disabled = false;
            updateStatus('FOLDER SELECTED');
        }
    } catch (error) {
        showResult('Error selecting folder: ' + error.message, 'error');
        updateStatus('ERROR');
    }
}

async function getFolderInfo(folderPath) {
    try {
        const result = await window.electronAPI.getFolderInfo(folderPath);
        if (result.success) {
            const info = result.info;
            document.getElementById('infoPath').textContent = folderPath;
            document.getElementById('infoSize').textContent = formatBytes(info.size);
            
            let itemsText = info.files + ' files, ' + info.folders + ' folders';
            if (info.limited) {
                itemsText += ' (10,000+ items)';
            }
            document.getElementById('infoItems').textContent = itemsText;
        } else {
            document.getElementById('infoSize').textContent = 'Unknown';
            document.getElementById('infoItems').textContent = 'Unknown';
        }
    } catch (error) {
        document.getElementById('infoSize').textContent = 'Unknown';
        document.getElementById('infoItems').textContent = 'Unknown';
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function deleteFolder() {
    console.log('deleteFolder called, selectedFolder:', selectedFolder);
    
    if (!selectedFolder) {
        showResult('No folder selected', 'error');
        updateStatus('ERROR: NO FOLDER SELECTED');
        return;
    }

    console.log('Showing confirmation dialog...');
    updateStatus('WAITING FOR CONFIRMATION');
    
    // Show custom confirmation dialog
    const confirmed = await showConfirmDialog(
        'Confirm Deletion',
        `Are you sure you want to permanently delete:\n\n${selectedFolder}\n\nThis action cannot be undone!`
    );
    
    console.log('Confirmation result:', confirmed);
    
    if (!confirmed) {
        updateStatus('DELETION CANCELLED');
        return;
    }

    // Show progress
    console.log('Starting deletion process...');
    updateStatus('PREPARING TO DELETE');
    progressBox.style.display = 'block';
    resultBox.style.display = 'none';
    deleteBtn.disabled = true;
    browseBtn.disabled = true;

    try {
        console.log('Calling forceDeleteFolder for:', selectedFolder);
        updateStatus('DELETING');
        const result = await window.electronAPI.forceDeleteFolder(selectedFolder);
        console.log('Delete result:', result);
        
        if (result.success) {
            showResult(`Folder successfully deleted: ${selectedFolder}`, 'success');
            updateStatus('FOLDER DELETED SUCCESSFULLY');
            // Reset UI
            selectedFolder = null;
            folderPathInput.value = '';
        } else {
            showResult(`Error deleting folder: ${result.error}`, 'error');
            updateStatus('ERROR: ' + result.error.toUpperCase());
        }
    } catch (error) {
        console.error('Delete error:', error);
        showResult('Error: ' + error.message, 'error');
        updateStatus('ERROR: ' + error.message.toUpperCase());
    } finally {
        progressBox.style.display = 'none';
        deleteBtn.disabled = false;
        browseBtn.disabled = false;
    }
}

function updateDeleteProgress(progress) {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    
    console.log('Progress update:', progress);
    
    if (progressFill) {
        progressFill.style.width = progress.percent + '%';
    }
    
    if (progressText) {
        progressText.textContent = progress.message || 'DELETING...';
    }
    
    if (progressPercent) {
        progressPercent.textContent = progress.percent + '%';
    }
    
    // Update status bar
    updateStatus(`${progress.stage.toUpperCase()}: ${progress.percent}%`);
}

function showResult(message, type) {
    resultBox.style.display = 'block';
    resultContent.className = `result-content ${type}`;
    resultContent.innerHTML = `
        <span class="result-icon">${type === 'success' ? '✓' : '✗'}</span>
        <span>${message}</span>
    `;
}

// Custom confirmation dialog
function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        // Create modal
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
                <button class="btn btn-danger modal-confirm">Delete</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Animate in
        setTimeout(() => overlay.classList.add('show'), 10);
        
        // Handle buttons
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
        
        // Focus confirm button
        confirmBtn.focus();
    });
}
