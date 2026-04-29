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
    const snap = await getDocs(collection(db, "fees"));
    let total = 0;
    let today = 0;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    snap.forEach(d => {
        const f = d.data();
        total += Number(f.amount);
        if(f.date === todayStr) today += Number(f.amount);
    });

    if(document.getElementById('totalCollected')) document.getElementById('totalCollected').textContent = `₹${total.toLocaleString()}`;
    if(document.getElementById('todayCollection')) document.getElementById('todayCollection').textContent = `₹${today.toLocaleString()}`;
    
    // For Pending - we check all students
    const stuSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    let pending = 0;
    stuSnap.forEach(d => pending += (d.data().pendingFees || 0));
    if(document.getElementById('totalPending')) document.getElementById('totalPending').textContent = `₹${pending.toLocaleString()}`;
}

async function fetchLedger() {
    try {
        const snap = await getDocs(query(collection(db, "fees"), orderBy("timestamp", "desc")));
        const list = document.getElementById('ledgerTableBody');
        if(!list) return;
        list.innerHTML = '';
        
        if (snap.empty) {
            list.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">No payment transactions recorded yet.</td></tr>';
            return;
        }

        snap.forEach(d => {
            const f = d.data();
            list.innerHTML += `
                <tr>
                    <td>${f.date}</td>
                    <td><span class="badge badge-info">${f.studentID}</span></td>
                    <td><strong>${f.studentName}</strong></td>
                    <td>${(f.feeType || 'tuition').toUpperCase()}</td>
                    <td>₹${Number(f.amount).toLocaleString()}</td>
                    <td><span class="badge badge-success">CASH/UPI</span></td>
                    <td><span class="badge badge-success">PAID</span></td>
                </tr>`;
        });
    } catch (err) {
        console.error("Ledger Fetch Error:", err);
        const list = document.getElementById('ledgerTableBody');
        if(list) list.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--danger)">Error loading ledger: ${err.message}. If this is a new collection, it may need a few minutes to index.</td></tr>`;
    }
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

// Handle Payment Entry
const paymentForm = document.getElementById('paymentForm');
if(paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const search = document.getElementById('payStudentSearch').value;
        const type = document.getElementById('payFeeType').value;
        const amount = Number(document.getElementById('payAmount').value);

        if(!search || !amount) { alert("Please enter Student ID and Amount."); return; }

        // Find Student
        const q = query(collection(db, "users"), where("role", "==", "student"), where("studentID", "==", search));
        const stuSnap = await getDocs(q);
        
        if(stuSnap.empty) { alert("Student not found!"); return; }
        
        const stuDoc = stuSnap.docs[0];
        const stuData = stuDoc.data();

        // 1. Add to Fees Collection
        await addDoc(collection(db, "fees"), {
            studentID: search,
            studentName: stuData.name,
            amount,
            feeType: type,
            date: new Date().toISOString().split('T')[0],
            timestamp: serverTimestamp()
        });

        // 2. Update Student's Pending Balance
        const newPending = Math.max(0, (stuData.pendingFees || 0) - amount);
        await updateDoc(doc(db, "users", stuDoc.id), { pendingFees: newPending });

        alert("Payment Recorded Successfully!");
        e.target.reset();
        fetchFinancialStats();
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Bills...';

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

        const batch = writeBatch(db);
        for (const stu of targets) {
            // Create a pending fee demand
            const demandRef = doc(collection(db, "fees"));
            batch.set(demandRef, {
                studentId: stu.id,
                studentName: stu.name,
                studentID: stu.studentID || "",
                class: stu.class,
                section: stu.section,
                category: category,
                amount: amount,
                dueDate: dueDate,
                note: note,
                status: "pending",
                timestamp: serverTimestamp()
            });

            // Update student's pending balance
            const stuRef = doc(db, "users", stu.id);
            const currentPending = stu.pendingFees || 0;
            batch.update(stuRef, {
                pendingFees: currentPending + amount
            });
        }

        await batch.commit();
        alert(`Successfully generated fee demands for ${targets.length} students.`);
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
