import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, deleteDoc, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    overview: document.getElementById('sectionOverview'),
    feecollection: document.getElementById('sectionFeecollection'),
    feebilling: document.getElementById('sectionFeebilling'),
    studentledger: document.getElementById('sectionStudentledger'),
    duereports: document.getElementById('sectionDuereports'),
    studentmaster: document.getElementById('sectionStudentMaster'),
    notices: document.getElementById('sectionNotices'),
    expenses: document.getElementById('sectionExpenses'),
    reports: document.getElementById('sectionReports')
};

const userNameEl = document.getElementById('userName');
const headerName = document.getElementById('headerName');
const logoutBtn = document.getElementById('logoutBtn');

// Auth
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'accountant') {
            const data = userDoc.data();
            if(userNameEl) userNameEl.textContent = data.name || "Accountant";
            if(headerName) headerName.textContent = data.name || "Accountant";
            initDashboard();
        } else { window.location.href = 'index.html'; }
    } else { window.location.href = 'index.html'; }
});

function initDashboard() {
    updateDate();
    fetchFinancialStats();
    window.fetchNotices();
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.id.replace('nav', '').toLowerCase();
            switchSection(target);
        });
    });

    document.getElementById('editStudentForm').addEventListener('submit', handleEditStudentUpdate);
    if(document.getElementById('billingForm')) document.getElementById('billingForm').addEventListener('submit', handleBillingSubmit);
}

window.switchSection = (target) => {
    Object.values(sections).forEach(s => { if(s) s.style.display = 'none'; });
    if (sections[target]) {
        sections[target].style.display = 'block';
        navItems.forEach(ni => ni.classList.toggle('active', ni.id === `nav${target.charAt(0).toUpperCase() + target.slice(1)}`));
        
        const bc = document.getElementById('breadcrumbCurr');
        if(bc) bc.textContent = target.charAt(0).toUpperCase() + target.slice(1);

        if(target === 'overview') fetchFinancialStats();
        if(target === 'studentledger') fetchLedger();
        if(target === 'duereports') window.fetchDueReports();
        if(target === 'studentmaster') { window.populateStudentMasterFilters(); window.fetchStudentMaster(); }
        if(target === 'feebilling') populateBillingDropdowns();
        if(target === 'notices') window.fetchNotices();
    }
};

async function fetchFinancialStats() {
    try {
        const jvSnap = await getDocs(collection(db, "journal_entries"));
        let totalCollected = 0;
        let todayCollected = 0;
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        jvSnap.forEach(d => {
            const jv = d.data();
            if (!jv.entries) return;
            
            // Look for debits to Cash or Bank to indicate real collection
            jv.entries.forEach(entry => {
                if (entry.type === 'debit' && (entry.account === 'Cash in Hand' || entry.account === 'Bank Settlement')) {
                    totalCollected += Number(entry.amount);
                    if (jv.date === todayStr) {
                        todayCollected += Number(entry.amount);
                    }
                }
            });
        });

        if(document.getElementById('totalCollected')) document.getElementById('totalCollected').textContent = `₹${totalCollected.toLocaleString()}`;
        if(document.getElementById('todayCollection')) document.getElementById('todayCollection').textContent = `₹${todayCollected.toLocaleString()}`;
        
        // Calculate total pending AR from Invoices
        // This is a more robust way than summing user.pendingFees, which is just a cached value
        const invSnap = await getDocs(query(collection(db, "invoices"), where("status", "in", ["unpaid", "partial"])));
        let totalPending = 0;
        let overdueCount = 0;
        
        invSnap.forEach(d => {
            const inv = d.data();
            totalPending += Number(inv.dueAmount || 0);
            
            // Check if overdue
            if (inv.dueDate && inv.dueDate < todayStr) {
                overdueCount++;
            }
        });
        
        if(document.getElementById('totalPending')) document.getElementById('totalPending').textContent = `₹${totalPending.toLocaleString()}`;
        if(document.getElementById('pendingInvoices')) document.getElementById('pendingInvoices').textContent = overdueCount;

        // Fetch recent transaction activity from Journal
        fetchRecentActivity();

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
    }
}

async function fetchRecentActivity() {
    const list = document.getElementById('recentFeesList');
    if (!list) return;

    try {
        // Query journal entries ordered by timestamp
        const jvQ = query(collection(db, "journal_entries"), orderBy("timestamp", "desc"));
        const jvSnap = await getDocs(jvQ);
        
        if (jvSnap.empty) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:.8rem">No recent journal entries recorded.</p>';
            return;
        }

        list.innerHTML = '';
        let count = 0;
        jvSnap.forEach(d => {
            if (count >= 5) return; // Only show top 5
            const jv = d.data();
            const date = jv.date || '---';
            const narration = jv.narration || 'Journal Entry';
            const amount = jv.totalAmount || 0;
            
            // Determine icon based on narration context
            let icon = 'fa-book-journal-whills';
            let color = 'var(--brand-500)';
            if (narration.includes('Payment received')) {
                icon = 'fa-money-bill-wave';
                color = 'var(--success)';
            } else if (narration.includes('Fee Demand')) {
                icon = 'fa-file-invoice';
                color = 'var(--warning)';
            }

            list.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.75rem 0; border-bottom: 1px solid var(--border)">
                    <div style="display:flex; align-items:center; gap:1rem">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--bg-muted); display:flex; align-items:center; justify-content:center; color:${color}">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div>
                            <p style="margin:0; font-size:0.85rem; font-weight:600; color:var(--text-primary)">${narration}</p>
                            <span style="font-size:0.7rem; color:var(--text-muted)">Date: ${date}</span>
                        </div>
                    </div>
                    <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary)">₹${Number(amount).toLocaleString()}</div>
                </div>
            `;
            count++;
        });
        
    } catch (err) {
        console.error("Recent Activity Error:", err);
    }
}

window.fetchEnterpriseLedger = async function() {
    const searchId = document.getElementById('ledgerSearchInput').value;
    const list = document.getElementById('ledgerTableBody');
    const summaryBox = document.getElementById('ledgerSummaryBox');
    
    if (!searchId) {
        alert("Please enter a Student ID to search.");
        return;
    }

    list.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching Ledger...</td></tr>';
    
    try {
        // 1. Fetch Student Details
        const stuQ = query(collection(db, "users"), where("role", "==", "student"), where("studentID", "==", searchId));
        const stuSnap = await getDocs(stuQ);
        
        if (stuSnap.empty) {
            list.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--danger)">Student not found! Check the ID.</td></tr>';
            summaryBox.style.display = 'none';
            document.getElementById('printLedgerBtn').style.display = 'none';
            return;
        }
        
        const stuDoc = stuSnap.docs[0];
        const stuData = stuDoc.data();
        const studentFirebaseId = stuDoc.id;

        // Populate Summary Box
        document.getElementById('ledgerStudentName').textContent = `${stuData.name} (${stuData.class}-${stuData.section})`;
        document.getElementById('ledgerPending').textContent = `₹${(stuData.pendingFees || 0).toLocaleString()}`;
        document.getElementById('ledgerAdvance').textContent = `₹${(stuData.advanceBalance || 0).toLocaleString()}`;
        summaryBox.style.display = 'grid';
        document.getElementById('printLedgerBtn').style.display = 'inline-flex';

        // 2. Fetch Invoices (Debits)
        const invQ = query(collection(db, "invoices"), where("studentId", "==", studentFirebaseId));
        const invSnap = await getDocs(invQ);
        
        // 3. Fetch Receipts (Credits)
        const recQ = query(collection(db, "fees"), where("studentID", "==", searchId));
        const recSnap = await getDocs(recQ);

        let transactions = [];

        invSnap.forEach(d => {
            const data = d.data();
            transactions.push({
                date: data.createdAt,
                timestamp: data.timestamp ? data.timestamp.toMillis() : Date.now(),
                docNo: data.invoiceNo || 'INV/OLD',
                type: 'Invoice',
                particulars: `Fee Demand - ${(data.feeHeads && data.feeHeads.length > 0) ? data.feeHeads[0].category : 'Fee'}`,
                debit: data.totalAmount,
                credit: 0
            });
        });

        recSnap.forEach(d => {
            const data = d.data();
            transactions.push({
                date: data.date,
                timestamp: data.timestamp ? data.timestamp.toMillis() : Date.now(),
                docNo: data.receiptNo || 'RCPT/OLD',
                type: 'Receipt',
                particulars: `Payment Received - ${data.paymentMode || 'CASH'} ${data.txNote ? '('+data.txNote+')' : ''}`,
                debit: 0,
                credit: data.amount
            });
        });

        // 4. Sort chronologically
        transactions.sort((a, b) => a.timestamp - b.timestamp);

        // 5. Render with Running Balance
        list.innerHTML = '';
        if (transactions.length === 0) {
            list.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">No financial history found for this student.</td></tr>';
            return;
        }

        let runningBalance = 0;
        transactions.forEach(t => {
            runningBalance += (t.debit - t.credit);
            
            let typeBadge = t.type === 'Invoice' ? '<span class="badge badge-warning">INVOICE</span>' : '<span class="badge badge-success">RECEIPT</span>';
            let balanceColor = runningBalance > 0 ? 'var(--danger-dark)' : (runningBalance < 0 ? 'var(--success-dark)' : 'inherit');
            let displayBalance = runningBalance < 0 ? `(₹${Math.abs(runningBalance).toLocaleString()})` : `₹${runningBalance.toLocaleString()}`;

            list.innerHTML += `
                <tr>
                    <td>${t.date}</td>
                    <td style="font-family:var(--font-mono); font-weight:600; font-size:0.8rem">${t.docNo}</td>
                    <td>${typeBadge}</td>
                    <td>${t.particulars}</td>
                    <td style="color:var(--danger)">${t.debit > 0 ? '₹' + t.debit.toLocaleString() : '-'}</td>
                    <td style="color:var(--success)">${t.credit > 0 ? '₹' + t.credit.toLocaleString() : '-'}</td>
                    <td style="font-weight:700; color:${balanceColor}">${displayBalance}</td>
                </tr>`;
        });

    } catch (err) {
        console.error("Ledger Fetch Error:", err);
        list.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--danger)">Error loading ledger: ${err.message}</td></tr>`;
    }
}

// Override old fetchLedger mapping
window.fetchLedger = function() {
    // If an ID is already in the search box when switching tabs, auto-fetch
    if(document.getElementById('ledgerSearchInput') && document.getElementById('ledgerSearchInput').value) {
        window.fetchEnterpriseLedger();
    }
}

window.printLedger = function() {
    window.print();
}

window.fetchDueReports = async function() {
    try {
        // Use a simpler query to avoid composite index requirements (where + orderBy)
        const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
        const list = document.getElementById('dueReportsTableBody');
        if(!list) return;
        list.innerHTML = '';

        let count = 0;
        let students = [];
        snap.forEach(d => students.push(d.data()));
        
        // Sort manually by name in JS
        students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        students.forEach(u => {
            const pending = u.pendingFees || 0;
            if (pending > 0) {
                count++;
                list.innerHTML += `
                    <tr>
                        <td><span class="badge badge-info">${u.studentID}</span></td>
                        <td><strong>${u.name}</strong></td>
                        <td>${u.class} - ${u.section}</td>
                        <td style="color:var(--danger-dark);font-weight:700">₹${pending.toLocaleString()}</td>
                        <td>${u.timestamp ? u.timestamp.toDate().toLocaleDateString() : '---'}</td>
                    </tr>`;
            }
        });

        if (count === 0) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:3rem;color:var(--text-muted)">No outstanding dues found! All accounts are clear.</td></tr>';
        }
    } catch (err) {
        console.error("Due Report Error:", err);
    }
}

// Handle Payment Entry (Enterprise POS Mode)
const paymentForm = document.getElementById('paymentForm');
if(paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const search = document.getElementById('payStudentSearch').value;
        const type = document.getElementById('payFeeType').value;
        const amount = Number(document.getElementById('payAmount').value);
        
        // Ensure new fields exist before trying to read their values
        const modeInput = document.getElementById('payMode');
        const noteInput = document.getElementById('payNote');
        const paymentMode = modeInput ? modeInput.value.toUpperCase() : "CASH";
        const txNote = noteInput ? noteInput.value : "";
        
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if(!search || !amount || amount <= 0) { alert("Please enter valid Student ID and Amount."); return; }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        try {
            // Find Student
            const q = query(collection(db, "users"), where("role", "==", "student"), where("studentID", "==", search));
            const stuSnap = await getDocs(q);
            
            if(stuSnap.empty) { throw new Error("Student not found!"); }
            
            const stuDoc = stuSnap.docs[0];
            const stuData = stuDoc.data();

            const batch = writeBatch(db);
            const dateStr = new Date().toISOString().split('T')[0];
            const receiptNo = `RCPT/${new Date().getFullYear()}/${Math.floor(Math.random()*1000000)}`;

            // 1. Create Receipt Document (Backward compatible by storing in 'fees', but structured as a receipt)
            const receiptRef = doc(collection(db, "fees"));
            batch.set(receiptRef, {
                receiptNo: receiptNo,
                studentId: stuDoc.id,
                studentID: search,
                studentName: stuData.name,
                amount: amount,
                feeType: type,
                paymentMode: paymentMode,
                txNote: txNote,
                date: dateStr,
                timestamp: serverTimestamp()
            });

            // 2. Post Journal Entry (Double Entry: Debit Cash/Bank, Credit Accounts Receivable)
            const debitAccount = (paymentMode === "CASH") ? "Cash in Hand" : "Bank Settlement";
            const jvRef = doc(collection(db, "journal_entries"));
            batch.set(jvRef, {
                date: dateStr,
                narration: `Payment received: ${receiptNo} from ${stuData.name} via ${paymentMode}`,
                entries: [
                    { account: debitAccount, accountType: "Asset", type: "debit", amount: amount },
                    { account: "Accounts Receivable", accountType: "Asset", subLedgerId: stuDoc.id, type: "credit", amount: amount }
                ],
                totalAmount: amount,
                timestamp: serverTimestamp(),
                sourceDoc: receiptRef.id
            });

            // 3. FIFO Invoice Matching
            // Find unpaid invoices for this student to settle
            let remainingAmount = amount;
            const invQ = query(collection(db, "invoices"), where("studentId", "==", stuDoc.id), where("status", "in", ["unpaid", "partial"]), orderBy("createdAt", "asc"));
            const invSnap = await getDocs(invQ);
            
            invSnap.forEach(invD => {
                if (remainingAmount <= 0) return;
                const inv = invD.data();
                const due = inv.dueAmount;
                const settleAmount = Math.min(due, remainingAmount);
                
                const newPaid = inv.paidAmount + settleAmount;
                const newDue = inv.dueAmount - settleAmount;
                const newStatus = newDue <= 0 ? "paid" : "partial";
                
                batch.update(doc(db, "invoices", invD.id), {
                    paidAmount: newPaid,
                    dueAmount: newDue,
                    status: newStatus
                });
                remainingAmount -= settleAmount;
            });

            // If there's remaining amount, it becomes Advance Fee (Liability)
            let newPending = (stuData.pendingFees || 0) - amount;
            let advanceFeeAdjustment = 0;
            if (newPending < 0) {
                // The student paid more than they owed. 
                // We should theoretically post another JV: Debit AR, Credit Advance Fees Liability
                advanceFeeAdjustment = Math.abs(newPending);
                newPending = 0;
            }

            // 4. Update Student's Master Balance
            batch.update(doc(db, "users", stuDoc.id), { 
                pendingFees: newPending,
                advanceBalance: (stuData.advanceBalance || 0) + advanceFeeAdjustment
            });

            await batch.commit();

            alert(`Payment Recorded Successfully! Receipt: ${receiptNo}`);
            e.target.reset();
            fetchFinancialStats();
            fetchLedger();
        } catch (err) {
            alert(err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Process Payment';
        }
    });
}

function updateDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateEl = document.getElementById('currentDate');
    if(dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', options);
}

// --- STUDENT MASTER LOGIC ---
window.fetchStudentMaster = async function() {
    const searchEl = document.getElementById('stuSearch');
    const filterClassEl = document.getElementById('stuFilterClass');
    const filterSectionEl = document.getElementById('stuFilterSection');
    const search = searchEl ? searchEl.value.toLowerCase() : '';
    const filterClass = filterClassEl ? filterClassEl.value : '';
    const filterSection = filterSectionEl ? filterSectionEl.value : '';
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    const list = document.getElementById('studentMasterTableBody'); list.innerHTML = '';
    let count = 1;
    snap.forEach(d => {
        const u = d.data();
        const matchesSearch = !search || (u.name && u.name.toLowerCase().includes(search)) || (u.email && u.email.toLowerCase().includes(search)) || (u.studentID && u.studentID.toLowerCase().includes(search));
        const matchesClass = !filterClass || u.class === filterClass;
        const matchesSection = !filterSection || u.section === filterSection;
        if (matchesSearch && matchesClass && matchesSection) {
            list.innerHTML += `
                <tr>
                    <td>${count++}</td>
                    <td><span style="font-family:var(--font-mono);font-size:.75rem;font-weight:700;color:var(--brand-600)">${u.studentID || '---'}</span></td>
                    <td><strong>${u.name}</strong></td>
                    <td><span class="badge badge-info">${u.class} - ${u.section}</span></td>
                    <td>${u.email}</td>
                    <td>
                        <div style="display:flex; gap:.4rem">
                            <button class="btn btn-secondary btn-sm" onclick="window.showStudentDetails('${d.id}')" title="View Details"><i class="fa-solid fa-eye"></i></button>
                            <button class="btn btn-primary btn-sm" onclick="window.openEditStudentModal('${d.id}')" title="Edit Student"><i class="fa-solid fa-pencil"></i></button>
                        </div>
                    </td>
                </tr>`;
        }
    });
    if (list.innerHTML === '') list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted)">No students found.</td></tr>';
}

window.showStudentDetails = async function(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) {
        const u = docSnap.data();
        const modal = document.getElementById('studentDetailModal');
        const content = document.getElementById('studentDetailContent');
        if(modal && content) {
            content.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
                    <div class="input-group"><label>Full Name</label><p style="font-weight:600">${u.name}</p></div>
                    <div class="input-group"><label>Student ID</label><p style="font-weight:600;color:var(--brand-600)">${u.studentID || '---'}</p></div>
                    <div class="input-group"><label>Class / Section</label><p>${u.class} - ${u.section}</p></div>
                    <div class="input-group"><label>Email</label><p>${u.email}</p></div>
                    <div class="input-group"><label>Father's Name</label><p>${u.fatherName || '---'}</p></div>
                    <div class="input-group"><label>Mother's Name</label><p>${u.motherName || '---'}</p></div>
                    <div class="input-group"><label>Contact No.</label><p>${u.contact || '---'}</p></div>
                    <div class="input-group" style="grid-column:span 2"><label>Address</label><p>${u.address || '---'}</p></div>
                </div>
            `;
            modal.classList.add('show');
        }
    }
}

window.resetStudentFilters = () => {
    if (document.getElementById('stuSearch')) document.getElementById('stuSearch').value = '';
    if (document.getElementById('stuFilterClass')) document.getElementById('stuFilterClass').value = '';
    if (document.getElementById('stuFilterSection')) document.getElementById('stuFilterSection').value = '';
    window.updateStudentMasterSections();
    window.fetchStudentMaster();
};

let studentMasterSections = [];
window.populateStudentMasterFilters = async function() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    studentMasterSections = sSnap.docs.map(doc => doc.data());
    const fClass = document.getElementById('stuFilterClass');
    if(fClass) {
        fClass.innerHTML = '<option value="">All Classes</option>';
        cSnap.forEach(d => fClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
        if (!fClass.dataset.filterListener) {
            fClass.addEventListener('change', () => window.updateStudentMasterSections());
            fClass.dataset.filterListener = "true";
        }
    }
    window.updateStudentMasterSections();
}

window.updateStudentMasterSections = function() {
    const fClass = document.getElementById('stuFilterClass');
    const fSection = document.getElementById('stuFilterSection');
    if(!fSection) return;
    const selectedClass = fClass ? fClass.value : "";
    fSection.innerHTML = '<option value="">All Sections</option>';
    const filtered = selectedClass ? studentMasterSections.filter(s => s.parentClass === selectedClass) : studentMasterSections;
    filtered.forEach(s => fSection.innerHTML += `<option value="${s.name}">${s.name}</option>`);
    window.fetchStudentMaster();
}

// --- EDIT/PROMOTE SHARED LOGIC ---
window.openEditStudentModal = async function(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (!docSnap.exists()) return;
    const u = docSnap.data();
    document.getElementById('editStuUid').value = uid;
    document.getElementById('editStuName').value = u.name || '';
    document.getElementById('editStuEmail').value = u.email || '';
    document.getElementById('editStuFather').value = u.fatherName || '';
    document.getElementById('editStuMother').value = u.motherName || '';
    document.getElementById('editStuContact').value = u.contact || '';
    document.getElementById('editStuAddress').value = u.address || '';
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "sections"), orderBy("name")));
    const allSectionsForEdit = sSnap.docs.map(doc => doc.data());
    const editClass = document.getElementById('editStuClass');
    const editSection = document.getElementById('editStuSection');
    editClass.innerHTML = '<option value="">Select Class</option>';
    cSnap.forEach(d => { const name = d.data().name; editClass.innerHTML += `<option value="${name}" ${name === u.class ? 'selected' : ''}>${name}</option>`; });
    const updateEditSections = (selectedClass) => {
        editSection.innerHTML = '<option value="">Select Section</option>';
        allSectionsForEdit.filter(s => s.parentClass === selectedClass).forEach(s => { editSection.innerHTML += `<option value="${s.name}" ${s.name === u.section ? 'selected' : ''}>${s.name}</option>`; });
    };
    updateEditSections(u.class);
    editClass.onchange = (e) => updateEditSections(e.target.value);
    document.getElementById('editStudentModal').classList.add('show');
}

async function handleEditStudentUpdate(e) {
    e.preventDefault();
    const uid = document.getElementById('editStuUid').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const data = { name: document.getElementById('editStuName').value, class: document.getElementById('editStuClass').value, section: document.getElementById('editStuSection').value, fatherName: document.getElementById('editStuFather').value, motherName: document.getElementById('editStuMother').value, contact: document.getElementById('editStuContact').value, address: document.getElementById('editStuAddress').value };
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try { await updateDoc(doc(db, "users", uid), data); alert("Student updated!"); document.getElementById('editStudentModal').classList.remove('show'); window.fetchStudentMaster(); }
    catch (err) { alert("Error: " + err.message); }
    finally { btn.disabled = false; btn.innerHTML = 'Save Changes'; }
}

window.openPromoteModal = async function() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sourceSelect = document.getElementById('promoteSourceClass');
    const targetSelect = document.getElementById('promoteTargetClass');
    sourceSelect.innerHTML = '<option value="">Select Class</option>';
    targetSelect.innerHTML = '<option value="">Select Target Class</option>';
    cSnap.forEach(d => { const name = d.data().name; sourceSelect.innerHTML += `<option value="${name}">${name}</option>`; targetSelect.innerHTML += `<option value="${name}">${name}</option>`; });
    document.getElementById('promoteStudentListBody').innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">Select class.</td></tr>';
    document.getElementById('selectAllPromote').checked = false;
    document.getElementById('promoteCount').textContent = '0 Students Selected';
    document.getElementById('promoteModal').classList.add('show');
}

window.fetchPromoteStudentList = async function() {
    const sourceClass = document.getElementById('promoteSourceClass').value;
    const listBody = document.getElementById('promoteStudentListBody');
    if (!sourceClass) { listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">Select class.</td></tr>'; return; }
    listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
    const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("class", "==", sourceClass)));
    listBody.innerHTML = '';
    document.getElementById('selectAllPromote').checked = false;
    window.updatePromoteCount();
    if (snapshot.empty) { listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;">No students found.</td></tr>'; return; }
    snapshot.forEach(d => { const u = d.data(); listBody.innerHTML += `<tr><td><input type="checkbox" class="promote-check" value="${d.id}" onchange="window.updatePromoteCount()"></td><td><span style="font-family:var(--font-mono); font-weight:700">${u.studentID || '---'}</span></td><td>${u.name}</td><td><span class="badge badge-info">${u.section}</span></td></tr>`; });
}

window.toggleSelectAllPromote = function(source) { document.querySelectorAll('.promote-check').forEach(c => c.checked = source.checked); window.updatePromoteCount(); }
window.updatePromoteCount = function() { const count = document.querySelectorAll('.promote-check:checked').length; document.getElementById('promoteCount').textContent = `${count} Students Selected`; }

window.handleBulkPromotion = async function() {
    const targetClass = document.getElementById('promoteTargetClass').value;
    const selectedStudents = Array.from(document.querySelectorAll('.promote-check:checked')).map(c => c.value);
    if (!targetClass || selectedStudents.length === 0) { alert("Select class and students."); return; }
    if (!confirm(`Promote ${selectedStudents.length} students to ${targetClass}?`)) return;
    const btn = document.getElementById('confirmPromoteBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Promoting...`;
    try { for (const uid of selectedStudents) { await updateDoc(doc(db, "users", uid), { class: targetClass }); } alert("Promotion Successful!"); document.getElementById('promoteModal').classList.remove('show'); window.fetchStudentMaster(); }
    catch (err) { alert("Error: " + err.message); }
    finally { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-arrow-up-right-dots"></i> Promote Selected`; }
}

// --- NOTICE BOARD LOGIC ---
window.fetchNotices = async function() {
    const briefList = document.getElementById('noticeBriefList');
    const fullList = document.getElementById('fullNoticeList');
    if (!briefList && !fullList) return;

    try {
        const snap = await getDocs(query(collection(db, "notices"), where("audience", "==", "all"), orderBy("timestamp", "desc")));
        
        if (briefList) {
            briefList.innerHTML = '';
            if (snap.empty) {
                briefList.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:.8rem">No recent notices.</p>';
            } else {
                snap.docs.slice(0, 3).forEach(d => {
                    const n = d.data();
                    const date = n.timestamp ? n.timestamp.toDate().toLocaleDateString() : 'Just now';
                    briefList.innerHTML += `
                        <div style="padding:.75rem; background:var(--bg-muted); border-radius:var(--r-sm); border-left:3px solid var(--brand-500)">
                            <h4 style="font-size:.85rem; margin-bottom:.15rem">${n.title}</h4>
                            <p style="font-size:.7rem; color:var(--text-muted)">${date}</p>
                        </div>`;
                });
            }
        }

        if (fullList) {
            fullList.innerHTML = '';
            if (snap.empty) {
                fullList.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-bullhorn"></i><h3>No notices found</h3><p>Check back later for school announcements.</p></div>';
            } else {
                snap.forEach(d => {
                    const n = d.data();
                    const date = n.timestamp ? n.timestamp.toDate().toLocaleString() : 'Just now';
                    const fileLink = n.fileUrl ? `<a href="${n.fileUrl}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:1rem; width:100%"><i class="fa-solid fa-paperclip"></i> View Attachment (${n.fileType.toUpperCase()})</a>` : '';
                    
                    fullList.innerHTML += `
                        <div class="content-card animate-slide-up" style="margin-bottom:0">
                            <div class="card-body">
                                <div style="display:flex; justify-content:space-between; margin-bottom:1rem">
                                    <span class="badge badge-info">${n.audience.toUpperCase()}</span>
                                    <span style="font-size:.75rem; color:var(--text-muted)">${date}</span>
                                </div>
                                <h3 style="font-size:1.1rem; margin-bottom:.75rem; color:var(--brand-700)">${n.title}</h3>
                                <p style="font-size:.9rem; color:var(--text-secondary); white-space:pre-wrap">${n.content || ''}</p>
                                ${fileLink}
                            </div>
                        </div>`;
                });
            }
        }
    } catch (err) {
        console.error("Notice fetch error:", err);
    }
}

window.showMyProfile = async function() {
    const user = auth.currentUser;
    if (!user) { alert("Session expired. Please login again."); return; }

    const modal = document.getElementById('profileDetailModal');
    const content = document.getElementById('profileDetailContent');
    if(!modal || !content) return;

    content.innerHTML = '<div style="text-align:center;padding:2rem"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p>Loading Profile...</p></div>';
    modal.classList.add('show');

    try {
        const d = await getDoc(doc(db, "users", user.uid));
        if (!d.exists()) {
            content.innerHTML = '<div class="empty-state"><h3>Profile not found</h3><p>Your staff record could not be located.</p></div>';
            return;
        }

        const u = d.data();
        const avatar = u.name ? u.name.charAt(0).toUpperCase() : '?';
        
        content.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem; margin-bottom:2rem">
                <div style="width:80px; height:80px; border-radius:50%; background:var(--brand-600); color:white; display:flex; align-items:center; justify-content:center; font-size:2.5rem; font-weight:800; box-shadow:var(--shadow-lg)">${avatar}</div>
                <div style="text-align:center">
                    <h2 style="margin:0; color:var(--text-primary)">${u.name || 'Accountant'}</h2>
                    <span class="badge badge-primary" style="margin-top:0.25rem">${(u.role || 'Accountant').toUpperCase()}</span>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr; gap:1rem; border-top:1px solid var(--border); padding-top:1.5rem">
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Email Address</span>
                    <span style="font-weight:700">${u.email || 'N/A'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Staff Category</span>
                    <span style="font-weight:700; color:var(--brand-600)">${(u.category || 'Administration').toUpperCase()}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Designation</span>
                    <span style="font-weight:700">${u.designation || 'Accounts Manager'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Contact Number</span>
                    <span style="font-weight:700">${u.contact || 'N/A'}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="color:var(--text-muted); font-weight:600">Department</span>
                    <span style="font-weight:700">Accounts & Finance</span>
                </div>
            </div>
            <div style="margin-top:1.5rem; padding:1rem; background:var(--bg-muted); border-radius:var(--r-md); font-size:0.8rem">
                <i class="fa-solid fa-lock" style="color:var(--brand-600)"></i> This profile contains sensitive financial access data. Ensure your session is logged out when not in use.
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

logoutBtn.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));
// --- FEE BILLING LOGIC ---
window.toggleBillingScope = (scope) => {
    const classWrap = document.getElementById('billClassWrap');
    const studentWrap = document.getElementById('billStudentWrap');
    
    if (scope === 'student') {
        classWrap.style.display = 'block';
        studentWrap.style.display = 'block';
    } else if (scope === 'class') {
        classWrap.style.display = 'block';
        studentWrap.style.display = 'none';
    } else {
        classWrap.style.display = 'none';
        studentWrap.style.display = 'none';
    }
};

let billingStudents = [];
async function populateBillingDropdowns() {
    const cSnap = await getDocs(query(collection(db, "classes"), orderBy("name")));
    const sSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student"), orderBy("name")));
    
    billingStudents = sSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const bClass = document.getElementById('billClass');
    const bStudent = document.getElementById('billStudent');

    if(bClass) {
        bClass.innerHTML = '<option value="">Choose Class</option>';
        cSnap.forEach(d => bClass.innerHTML += `<option value="${d.data().name}">${d.data().name}</option>`);
        
        bClass.onchange = (e) => {
            const selectedClass = e.target.value;
            bStudent.innerHTML = '<option value="">Choose Student</option>';
            billingStudents.filter(s => s.class === selectedClass).forEach(s => {
                bStudent.innerHTML += `<option value="${s.id}">${s.name} (${s.studentID || 'No ID'})</option>`;
            });
        };
    }
}

async function handleBillingSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('generateBillBtn');
    const scope = document.getElementById('billScope').value;
    const category = document.getElementById('billCategory').value;
    const amount = Number(document.getElementById('billAmount').value);
    const dueDate = document.getElementById('billDueDate').value;
    const note = document.getElementById('billNote').value;

    if (!amount || !dueDate) { alert("Please fill all required fields."); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Invoices...';

    try {
        let targets = [];
        if (scope === 'student') {
            const sId = document.getElementById('billStudent').value;
            if(!sId) throw new Error("Please select a student.");
            targets = billingStudents.filter(s => s.id === sId);
        } else if (scope === 'class') {
            const cName = document.getElementById('billClass').value;
            if(!cName) throw new Error("Please select a class.");
            targets = billingStudents.filter(s => s.class === cName);
        } else {
            targets = billingStudents;
        }

        if (targets.length === 0) throw new Error("No students found in the selected scope.");

        // Batch processing (Firestore limits batch to 500 writes)
        const chunkSize = 150;
        for (let i = 0; i < targets.length; i += chunkSize) {
            const batch = writeBatch(db);
            const chunk = targets.slice(i, i + chunkSize);
            
            for (const stu of chunk) {
                // 1. Create a detailed Enterprise Invoice Document
                const invoiceRef = doc(collection(db, "invoices"));
                const invoiceNo = `INV/${new Date().getFullYear()}/${Math.floor(Math.random()*1000000)}`;
                
                batch.set(invoiceRef, {
                    invoiceNo: invoiceNo,
                    studentId: stu.id,
                    studentName: stu.name,
                    studentID: stu.studentID || "",
                    class: stu.class,
                    section: stu.section,
                    feeHeads: [{ category: category, amount: amount }],
                    totalAmount: amount,
                    paidAmount: 0,
                    dueAmount: amount,
                    dueDate: dueDate,
                    note: note,
                    status: "unpaid",
                    createdAt: new Date().toISOString().split('T')[0],
                    timestamp: serverTimestamp()
                });

                // 2. Double Entry Posting (Debit AR, Credit Income)
                const jvRef = doc(collection(db, "journal_entries"));
                batch.set(jvRef, {
                    date: new Date().toISOString().split('T')[0],
                    narration: `Fee Demand Generated: ${invoiceNo} for ${stu.name}`,
                    entries: [
                        { account: "Accounts Receivable", accountType: "Asset", subLedgerId: stu.id, type: "debit", amount: amount },
                        { account: `${category} Income`, accountType: "Revenue", type: "credit", amount: amount }
                    ],
                    totalAmount: amount,
                    timestamp: serverTimestamp(),
                    sourceDoc: invoiceRef.id
                });

                // 3. Update student's pending balance (Backward compatibility & quick access)
                const stuRef = doc(db, "users", stu.id);
                const currentPending = stu.pendingFees || 0;
                batch.update(stuRef, {
                    pendingFees: currentPending + amount
                });
            }
            await batch.commit();
        }

        alert(`Successfully generated enterprise invoices & journal entries for ${targets.length} students.`);
        e.target.reset();
        window.toggleBillingScope('student');
        fetchFinancialStats();
    } catch (err) {
        alert("Billing failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Generate Fee Demand';
    }
}

// Add writeBatch to imports if not present
// Note: I will add writeBatch to the firestore imports at the top
