// Smart Grama Panchayat Management System - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Initialize mobile menu
  initMobileMenu();
  
  // Initialize search tabs
  initSearchTabs();
  
  // Initialize modals
  initModals();
  
  // Initialize form submissions
  initForms();
});

// Mobile Menu Toggle
function initMobileMenu() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', function() {
      navLinks.classList.toggle('active');
    });
  }
}

// Search Tabs Functionality
function initSearchTabs() {
  const searchTabs = document.querySelectorAll('.search-tab');
  const searchInput = document.querySelector('.search-input');
  const searchForm = document.querySelector('.search-form');
  
  if (searchTabs.length === 0) return;
  
  let currentSearchType = 'propertyId';
  
  searchTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Remove active class from all tabs
      searchTabs.forEach(t => t.classList.remove('active'));
      // Add active class to clicked tab
      this.classList.add('active');
      // Update search type
      currentSearchType = this.dataset.type;
      // Update input placeholder
      if (searchInput) {
        searchInput.placeholder = currentSearchType === 'propertyId' 
          ? 'Enter Property ID (e.g., PROP001)' 
          : 'Enter Owner Name';
      }
    });
  });
  
  // Handle search form submission
  if (searchForm) {
    searchForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const searchValue = searchInput.value.trim();
      if (!searchValue) {
        showAlert('Please enter a search value', 'warning');
        return;
      }
      
      // Show loading state
      const submitBtn = searchForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
      submitBtn.disabled = true;
      
      try {
        const response = await fetch('/api/search-tax', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            searchType: currentSearchType,
            searchValue: searchValue
          })
        });
        
        const result = await response.json();
        
        if (result.success !== false) {
          // The API returns array directly or wrapped in {success, data}
          const data = result.data ? result.data : result;
          displaySearchResults(data);
        } else {
          showAlert(result.message || 'No records found', 'error');
        }
      } catch (error) {
        showAlert('An error occurred while searching', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }
}

// Display Search Results
function displaySearchResults(results) {
  let resultsContainer = document.getElementById('searchResults');
  
  if (!resultsContainer) {
    resultsContainer = document.createElement('div');
    resultsContainer.id = 'searchResults';
    resultsContainer.className = 'results-section';
    
    const searchSection = document.querySelector('.search-section');
    if (searchSection) {
      searchSection.parentNode.insertBefore(resultsContainer, searchSection.nextSibling);
    }
  }
  
  if (!results || results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="card text-center">
        <i class="fas fa-search" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
        <h3>No Records Found</h3>
        <p class="text-muted">Please check your search criteria and try again.</p>
      </div>
    `;
    return;
  }
  
  let html = '<h3 class="mb-3">Search Results</h3>';
  
  results.forEach(record => {
    const statusClass = record.status.toLowerCase();
    const daysUntilDue = getDaysUntilDue(record.due_date);
    const dueClass = daysUntilDue <= 7 && record.status === 'Unpaid' ? 'due-soon' : '';
    
    html += `
      <div class="tax-result ${statusClass} ${dueClass} animate-slide">
        <div class="tax-detail">
          <div class="tax-detail-item">
            <span class="tax-label">Property ID</span>
            <span class="tax-value">${record.property_id}</span>
          </div>
          <div class="tax-detail-item">
            <span class="tax-label">Owner Name</span>
            <span class="tax-value">${record.owner_name}</span>
          </div>
          <div class="tax-detail-item">
            <span class="tax-label">Property Type</span>
            <span class="tax-value">${record.property_type || 'N/A'}</span>
          </div>
          <div class="tax-detail-item">
            <span class="tax-label">Address</span>
            <span class="tax-value">${record.address || 'N/A'}</span>
          </div>
          <div class="tax-detail-item">
            <span class="tax-label">Tax Year</span>
            <span class="tax-value">${record.year}</span>
          </div>
          <div class="tax-detail-item">
            <span class="tax-label">Due Date</span>
            <span class="tax-value">${formatDate(record.due_date)}</span>
          </div>
        </div>
        
        <div class="d-flex justify-between align-center mt-3" style="flex-wrap: wrap; gap: 1rem;">
          <div>
            <span class="tax-label">Tax Amount</span>
            <span class="tax-amount">₹${record.tax_amount.toLocaleString('en-IN')}</span>
          </div>
          <div class="d-flex align-center gap-2">
            <span class="status-badge ${statusClass}">${record.status}</span>
            ${record.status === 'Unpaid' ? 
              `<button class="btn btn-success" onclick="openPaymentModal('${record.property_id}', ${record.id}, ${record.tax_amount})">
                <i class="fas fa-credit-card"></i> Pay Now
              </button>` : 
              `<button class="btn btn-outline" disabled>
                <i class="fas fa-check"></i> Paid
              </button>`
            }
          </div>
        </div>
      </div>
    `;
  });
  
  resultsContainer.innerHTML = html;
}

// Get Days Until Due Date
function getDaysUntilDue(dueDate) {
  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Format Date
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-IN', options);
}

// Payment Modal
function initModals() {
  const paymentModal = document.getElementById('paymentModal');
  
  if (!paymentModal) return;
  
  const closeModal = paymentModal.querySelector('.modal-close');
  const cancelBtn = paymentModal.querySelector('.btn-outline');
  
  // Close modal handlers
  if (closeModal) {
    closeModal.addEventListener('click', () => closePaymentModal());
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closePaymentModal());
  }
  
  // Close on overlay click
  paymentModal.addEventListener('click', function(e) {
    if (e.target === paymentModal) {
      closePaymentModal();
    }
  });
}

// Open Payment Modal
function openPaymentModal(propertyId, taxRecordId, amount) {
  const modal = document.getElementById('paymentModal');
  if (!modal) return;
  
  document.getElementById('paymentPropertyId').textContent = propertyId;
  document.getElementById('paymentAmount').textContent = '₹' + amount.toLocaleString('en-IN');
  document.getElementById('paymentRecordId').value = taxRecordId;
  document.getElementById('paymentPropertyIdInput').value = propertyId;
  document.getElementById('paymentAmountInput').value = amount;
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close Payment Modal
function closePaymentModal() {
  const modal = document.getElementById('paymentModal');
  if (!modal) return;
  
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// Process Payment
async function processPayment() {
  const propertyId = document.getElementById('paymentPropertyIdInput').value;
  const taxRecordId = document.getElementById('paymentRecordId').value;
  const amount = document.getElementById('paymentAmountInput').value;
  
  const payBtn = document.getElementById('payButton');
  const originalText = payBtn.innerHTML;
  payBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  payBtn.disabled = true;
  
  try {
    const response = await fetch('/api/make-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        propertyId: propertyId,
        taxRecordId: taxRecordId,
        amount: parseFloat(amount)
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      closePaymentModal();
      showAlert('Payment successful! Redirecting...', 'success');
      
      // Redirect to success page
      setTimeout(() => {
        window.location.href = `/payment-success?txnId=${result.transactionId}&amount=${amount}&propertyId=${propertyId}`;
      }, 1500);
    } else {
      showAlert(result.message || 'Payment failed. Please try again.', 'error');
    }
  } catch (error) {
    showAlert('An error occurred during payment', 'error');
  } finally {
    payBtn.innerHTML = originalText;
    payBtn.disabled = false;
  }
}

// Make openPaymentModal accessible globally
window.openPaymentModal = openPaymentModal;
window.processPayment = processPayment;

// Form Initialization
function initForms() {
  // Tax Record Form
  const taxForm = document.getElementById('taxRecordForm');
  if (taxForm) {
    taxForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(taxForm);
      const submitBtn = taxForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      submitBtn.disabled = true;
      
      try {
        const response = await fetch('/api/admin/add-tax', {
          method: 'POST',
          body: new URLSearchParams(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
          showAlert(result.message, 'success');
          taxForm.reset();
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(result.message, 'error');
        }
      } catch (error) {
        showAlert('An error occurred', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }
  
  // Service Form
  const serviceForm = document.getElementById('serviceForm');
  if (serviceForm) {
    serviceForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(serviceForm);
      const submitBtn = serviceForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      submitBtn.disabled = true;
      
      try {
        const response = await fetch('/api/admin/add-service', {
          method: 'POST',
          body: new URLSearchParams(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
          showAlert(result.message, 'success');
          serviceForm.reset();
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(result.message, 'error');
        }
      } catch (error) {
        showAlert('An error occurred', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Property Form
  const propertyForm = document.getElementById('propertyForm');
  if (propertyForm) {
    propertyForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = new FormData(propertyForm);
      const submitBtn = propertyForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      submitBtn.disabled = true;
      
      try {
        const response = await fetch('/api/admin/add-property', {
          method: 'POST',
          body: new URLSearchParams(formData)
        });
        const result = await response.json();
        if (result.success) {
          showAlert(result.message || 'Property added successfully!', 'success');
          propertyForm.reset();
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(result.message || 'Error adding property', 'error');
        }
      } catch (error) {
        showAlert('An error occurred', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Citizen Form
  const citizenForm = document.getElementById('citizenForm');
  if (citizenForm) {
    citizenForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = new FormData(citizenForm);
      const submitBtn = citizenForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      submitBtn.disabled = true;
      
      try {
        const response = await fetch('/api/admin/add-citizen', {
          method: 'POST',
          body: new URLSearchParams(formData)
        });
        const result = await response.json();
        if (result.success) {
          showAlert(result.message || 'Citizen added successfully!', 'success');
          citizenForm.reset();
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(result.message || 'Error adding citizen', 'error');
        }
      } catch (error) {
        showAlert('An error occurred', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Scheme Form
  const schemeForm = document.getElementById('schemeForm');
  if (schemeForm) {
    schemeForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = new FormData(schemeForm);
      const submitBtn = schemeForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      submitBtn.disabled = true;
      try {
        const response = await fetch('/api/admin/add-scheme', {
          method: 'POST',
          body: new URLSearchParams(formData)
        });
        const result = await response.json();
        if (result.success) {
          showAlert(result.message || 'Scheme added successfully!', 'success');
          schemeForm.reset();
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(result.message || 'Error adding scheme', 'error');
        }
      } catch (error) {
        showAlert('An error occurred', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }
  // Edit Property Form
  const editPropForm = document.getElementById('editPropertyForm');
  if (editPropForm) {
    editPropForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await window.updateProperty();
    });
  }

  // Edit Citizen Form
  const editCitForm = document.getElementById('editCitizenForm');
  if (editCitForm) {
    editCitForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await window.updateCitizen();
    });
  }

  // Edit Tax Form
  const editTaxForm = document.getElementById('editTaxForm');
  if (editTaxForm) {
    editTaxForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await window.updateTaxRecord();
    });
  }

  // Edit Service Form
  const editServForm = document.getElementById('editServiceForm');
  if (editServForm) {
    editServForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await window.updateService();
    });
  }

  // Edit Scheme Form
  const editSchForm = document.getElementById('editSchemeForm');
  if (editSchForm) {
    editSchForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await window.updateScheme();
    });
  }
}


window.editTaxRecord = function(btn) {
  document.getElementById('editTaxId').value = btn.dataset.id;
  document.getElementById('editPropertyId').value = btn.dataset.propertyId;
  document.getElementById('editTaxAmount').value = btn.dataset.taxAmount;
  document.getElementById('editDueDate').value = btn.dataset.dueDate;
  document.getElementById('editYear').value = btn.dataset.year;
  document.getElementById('editStatus').value = btn.dataset.status;
  
  const modal = document.getElementById('editTaxModal');
  if (modal) modal.classList.add('active');
};

// Edit Service
window.editService = function(btn) {
  document.getElementById('editServiceId').value = btn.dataset.id;
  document.getElementById('editServiceTitle').value = btn.dataset.title;
  document.getElementById('editServiceDescription').value = btn.dataset.description;
  document.getElementById('editServiceIcon').value = btn.dataset.icon;
  document.getElementById('editServiceStatus').value = btn.dataset.status;
  
  const modal = document.getElementById('editServiceModal');
  if (modal) modal.classList.add('active');
};

// Edit Property
window.editProperty = function(btn) {
  document.getElementById('editPropId').value = btn.dataset.id;
  document.getElementById('editPropertyIdField').value = btn.dataset.propertyId;
  document.getElementById('editPropOwnerName').value = btn.dataset.ownerName;
  document.getElementById('editPropAddress').value = btn.dataset.address;
  document.getElementById('editPropType').value = btn.dataset.propertyType;
  
  const modal = document.getElementById('editPropertyModal');
  if (modal) modal.classList.add('active');
};

// Edit Citizen
window.editCitizen = function(btn) {
  document.getElementById('editCitId').value = btn.dataset.id;
  document.getElementById('editCitPropertyId').value = btn.dataset.propertyId;
  document.getElementById('editCitName').value = btn.dataset.name;
  document.getElementById('editCitPhone').value = btn.dataset.phone;
  document.getElementById('editCitEmail').value = btn.dataset.email;
  document.getElementById('editCitAge').value = btn.dataset.age;
  document.getElementById('editCitGender').value = btn.dataset.gender;
  document.getElementById('editCitOccupation').value = btn.dataset.occupation;
  document.getElementById('editCitIncome').value = btn.dataset.income;
  document.getElementById('editCitLandSize').value = btn.dataset.landSize;
  document.getElementById('editCitIsFarmer').value = btn.dataset.isFarmer;
  document.getElementById('editCitIsStudent').value = btn.dataset.isStudent;
  document.getElementById('editCitDisability').value = btn.dataset.disability;
  
  const modal = document.getElementById('editCitizenModal');
  if (modal) modal.classList.add('active');
};

// Edit Scheme
window.editScheme = function(btn) {
  document.getElementById('editSchemeId').value = btn.dataset.id;
  document.getElementById('editSchemeTitle').value = btn.dataset.title;
  document.getElementById('editSchemeDescription').value = btn.dataset.description;
  document.getElementById('editSchemeCriteria').value = btn.dataset.targetCriteria;
  
  const modal = document.getElementById('editSchemeModal');
  if (modal) modal.classList.add('active');
};

// Close Modals
window.closeEditTaxModal = function() {
  const modal = document.getElementById('editTaxModal');
  if (modal) modal.classList.remove('active');
};

window.closeEditServiceModal = function() {
  const modal = document.getElementById('editServiceModal');
  if (modal) modal.classList.remove('active');
};

window.closeEditPropertyModal = function() {
  const modal = document.getElementById('editPropertyModal');
  if (modal) modal.classList.remove('active');
};

window.closeEditCitizenModal = function() {
  const modal = document.getElementById('editCitizenModal');
  if (modal) modal.classList.remove('active');
};

window.closeEditSchemeModal = function() {
  const modal = document.getElementById('editSchemeModal');
  if (modal) modal.classList.remove('active');
};

// Delete Tax Record
window.deleteTaxRecord = async function(target) {
  if (!confirm('Are you sure you want to delete this tax record?')) return;
  const id = (target && typeof target === 'object') ? target.dataset.id : target;
  
  try {
    const formData = new FormData();
    formData.append('id', id);
    
    const response = await fetch('/api/admin/delete-tax', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message, 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message, 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  }
};

// Delete Service
window.deleteService = async function(target) {
  if (!confirm('Are you sure you want to delete this service?')) return;
  const id = (target && typeof target === 'object') ? target.dataset.id : target;
  
  try {
    const formData = new FormData();
    formData.append('id', id);
    
    const response = await fetch('/api/admin/delete-service', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message, 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message, 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  }
};

// Delete Property
window.deleteProperty = async function(target) {
  if (!confirm('Are you sure you want to delete this property? This will not delete tax records associated with it.')) return;
  const id = (target && typeof target === 'object') ? target.dataset.id : target;
  
  try {
    const formData = new FormData();
    formData.append('id', id);
    
    const response = await fetch('/api/admin/delete-property', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message || 'Property deleted successfully!', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message || 'Failed to delete property', 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  }
};

// Delete Citizen
window.deleteCitizen = async function(target) {
  if (!confirm('Are you sure you want to delete this citizen?')) return;
  const id = (target && typeof target === 'object') ? target.dataset.id : target;
  
  try {
    const formData = new FormData();
    formData.append('id', id);
    
    const response = await fetch('/api/admin/delete-citizen', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message || 'Citizen deleted successfully!', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message || 'Failed to delete citizen', 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  }
};

// Delete Scheme
window.deleteScheme = async function(target) {
  if (!confirm('Are you sure you want to delete this scheme?')) return;
  const id = (target && typeof target === 'object') ? target.dataset.id : target;
  
  try {
    const formData = new FormData();
    formData.append('id', id);
    
    const response = await fetch('/api/admin/delete-scheme', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message || 'Scheme deleted successfully!', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message || 'Failed to delete scheme', 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  }
};

// Update Tax Record
window.updateTaxRecord = async function() {
  const form = document.getElementById('editTaxForm');
  const formData = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) return;
  
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch('/api/admin/update-tax', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message, 'success');
      closeEditTaxModal();
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message, 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
};

// Update Service
window.updateService = async function() {
  const form = document.getElementById('editServiceForm');
  const formData = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) return;
  
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch('/api/admin/update-service', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert(result.message, 'success');
      closeEditServiceModal();
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message, 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
};

// Update Property
window.updateProperty = async function() {
  const form = document.getElementById('editPropertyForm');
  const formData = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) return;
  
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch('/api/admin/update-property', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    const result = await response.json();
    if (result.success) {
      showAlert(result.message || 'Property updated successfully!', 'success');
      closeEditPropertyModal();
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message || 'Failed to update property', 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
};

// Update Citizen
window.updateCitizen = async function() {
  const form = document.getElementById('editCitizenForm');
  const formData = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) return;
  
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch('/api/admin/update-citizen', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    const result = await response.json();
    if (result.success) {
      showAlert(result.message || 'Citizen profile updated successfully!', 'success');
      closeEditCitizenModal();
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message || 'Failed to update citizen profile', 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
};

// Update Scheme
window.updateScheme = async function() {
  const form = document.getElementById('editSchemeForm');
  const formData = new FormData(form);
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) return;
  
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
  submitBtn.disabled = true;
  
  try {
    const response = await fetch('/api/admin/update-scheme', {
      method: 'POST',
      body: new URLSearchParams(formData)
    });
    const result = await response.json();
    if (result.success) {
      showAlert(result.message || 'Scheme updated successfully!', 'success');
      closeEditSchemeModal();
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showAlert(result.message || 'Failed to update scheme', 'error');
    }
  } catch (error) {
    showAlert('An error occurred', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
};

// Show Alert
function showAlert(message, type = 'info') {
  // Remove existing alerts
  const existingAlert = document.querySelector('.custom-alert');
  if (existingAlert) existingAlert.remove();
  
  const alertDiv = document.createElement('div');
  alertDiv.className = `custom-alert alert-${type}`;
  alertDiv.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: var(--radius-sm);

    background: ${type === 'success' ? '#E8F5E9' : type === 'error' ? '#FFEBEE' : '#E3F2FD'};
    color: ${type === 'success' ? '#2E7D32' : type === 'error' ? '#C62828' : '#1565C0'};
    border-left: 4px solid ${type === 'success' ? '#43A047' : type === 'error' ? '#E53935' : '#1565C0'};
    box-shadow: var(--shadow);
    z-index: 3000;
    animation: slideIn 0.3s ease;
    max-width: 350px;
  `;
  
  alertDiv.innerHTML = '<i class="fas fa-' + (type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle') + '"></i> ' + message;
  
  document.body.appendChild(alertDiv);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    alertDiv.style.opacity = '0';
    setTimeout(() => alertDiv.remove(), 300);
  }, 4000);
}

// Format currency
window.formatCurrency = function(amount) {
  return '₹' + parseFloat(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};
