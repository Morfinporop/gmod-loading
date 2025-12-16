// КОНФИГУРАЦИЯ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDhCqJoxoiMAkVjaPvK4xQdPBmslhZcZCg",
  authDomain: "rugram-c8037.firebaseapp.com",
  projectId: "rugram-c8037",
  storageBucket: "rugram-c8037.firebasestorage.app",
  messagingSenderId: "320736302382",
  appId: "1:320736302382:web:374bbc5d89e842c39116bf"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence().catch((err) => console.warn('Persistence:', err.code));

let currentUser = null;
let currentChatId = null;
let currentChatUser = null;
let chatsUnsubscribe = null;
let messagesUnsubscribe = null;

// ИНИЦИАЛИЗАЦИЯ
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  showScreen('splashScreen');
  
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      await updateUserStatus('online');
      await loadUserProfile();
      showScreen('mainScreen');
      loadChats();
      startLastSeenUpdater();
    } else {
      currentUser = null;
      setTimeout(() => showScreen('authScreen'), 2000);
    }
  });
}

function showScreen(screenId) {
  const screens = ['splashScreen', 'authScreen', 'mainScreen'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== screenId);
  });
}

// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК АВТОРИЗАЦИИ
function switchTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  
  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
  } else {
    loginTab.classList.remove('active');
    registerTab.classList.add('active');
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
  }
}

function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const icon = input.nextElementSibling;
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    showNotification('error', 'Ошибка', 'Заполните все поля');
    return;
  }
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showNotification('success', 'Успешно', 'Добро пожаловать!');
  } catch (error) {
    console.error('Login error:', error);
    let msg = 'Ошибка входа';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      msg = 'Неверный email или пароль';
    }
    showNotification('error', 'Ошибка', msg);
  }
}

async function handleRegister() {
  const name = document.getElementById('registerName').value.trim();
  const username = document.getElementById('registerUsername').value.trim().toLowerCase();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerPasswordConfirm').value;
  
  if (!name || !username || !email || !password || !confirm) {
    showNotification('error', 'Ошибка', 'Заполните все поля');
    return;
  }
  
  if (username.length < 3) {
    showNotification('error', 'Ошибка', 'Username минимум 3 символа');
    return;
  }
  
  if (!/^[a-z0-9_]+$/.test(username)) {
    showNotification('error', 'Ошибка', 'Username: только a-z, 0-9 и _');
    return;
  }
  
  if (password.length < 6) {
    showNotification('error', 'Ошибка', 'Пароль минимум 6 символов');
    return;
  }
  
  if (password !== confirm) {
    showNotification('error', 'Ошибка', 'Пароли не совпадают');
    return;
  }
  
  try {
    const check = await db.collection('users').where('username', '==', username).get();
    if (!check.empty) {
      showNotification('error', 'Ошибка', 'Username занят');
      return;
    }
    
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      name: name,
      username: username,
      email: email,
      avatar: null,
      status: 'online',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showNotification('success', 'Успешно', 'Аккаунт создан!');
  } catch (error) {
    console.error('Register error:', error);
    let msg = 'Ошибка регистрации';
    if (error.code === 'auth/email-already-in-use') msg = 'Email уже используется';
    showNotification('error', 'Ошибка', msg);
  }
}

async function handleLogout() {
  try {
    await updateUserStatus('offline');
    await auth.signOut();
    showNotification('info', 'Выход', 'До скорой встречи!');
    location.reload();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

async function loadUserProfile() {
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    const data = doc.data();
    if (data) {
      document.getElementById('sidebarName').textContent = data.name;
      document.getElementById('sidebarUsername').textContent = `@${data.username}`;
      document.getElementById('profileName').textContent = data.name;
      document.getElementById('profileUsername').textContent = `@${data.username}`;
      document.getElementById('profileEmail').textContent = data.email;
    }
  } catch (error) {
    console.error('Profile error:', error);
  }
}

async function updateUserStatus(status) {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).update({
      status: status,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Status error:', error);
  }
}

function startLastSeenUpdater() {
  setInterval(async () => {
    if (currentUser) {
      await db.collection('users').doc(currentUser.uid).update({
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }, 30000);
}

function loadChats() {
  const list = document.getElementById('chatsList');
  if (chatsUnsubscribe) chatsUnsubscribe();
  
  chatsUnsubscribe = db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid)
    .orderBy('lastMessageTime', 'desc')
    .onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        list.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-comments"></i>
            <p>Нет активных чатов</p>
            <button class="start-chat-btn" onclick="openNewChatDialog()">
              <i class="fas fa-plus"></i> Начать общение
            </button>
          </div>
        `;
        return;
      }
      
      list.innerHTML = '';
      for (const doc of snapshot.docs) {
        const chat = doc.data();
        const chatId = doc.id;
        const otherUserId = chat.participants.find(id => id !== currentUser.uid);
        const userDoc = await db.collection('users').doc(otherUserId).get();
        const user = userDoc.data();
        const el = createChatElement(chatId, user, chat);
        list.appendChild(el);
      }
    });
}

function createChatElement(chatId, user, chat) {
  const div = document.createElement('div');
  div.className = 'chat-item';
  div.dataset.chatId = chatId;
  if (chatId === currentChatId) div.classList.add('active');
  
  const msg = chat.lastMessage || 'Нет сообщений';
  const time = chat.lastMessageTime ? formatTime(chat.lastMessageTime.toDate()) : '';
  
  div.innerHTML = `
    <div class="user-avatar"><i class="fas fa-user"></i></div>
    <div class="chat-info">
      <div class="chat-info-header">
        <h4>${escapeHtml(user.name)}</h4>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-preview">${escapeHtml(msg)}</div>
    </div>
  `;
  
  div.onclick = () => openChat(chatId, user);
  return div;
}

async function openChat(chatId, user) {
  currentChatId = chatId;
  currentChatUser = user;
  
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.chatId === chatId);
  });
  
  document.getElementById('emptyChat').classList.add('hidden');
  document.getElementById('activeChat').classList.remove('hidden');
  document.getElementById('chatName').textContent = user.name;
  const status = document.getElementById('chatStatus');
  status.textContent = user.status === 'online' ? 'онлайн' : 'был(а) недавно';
  status.classList.toggle('online', user.status === 'online');
  
  loadMessages(chatId);
  
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('hidden-mobile');
  }
}

function closeActiveChat() {
  currentChatId = null;
  currentChatUser = null;
  if (messagesUnsubscribe) messagesUnsubscribe();
  document.getElementById('emptyChat').classList.remove('hidden');
  document.getElementById('activeChat').classList.add('hidden');
  document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('hidden-mobile');
  }
}

function loadMessages(chatId) {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '<div class="loading-messages"><i class="fas fa-spinner fa-spin"></i><p>Загрузка...</p></div>';
  
  if (messagesUnsubscribe) messagesUnsubscribe();
  
  messagesUnsubscribe = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      container.innerHTML = '';
      if (snapshot.empty) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-comment"></i><p>Начните переписку</p></div>';
        return;
      }
      snapshot.forEach((doc) => {
        const msg = doc.data();
        const el = createMessageElement(msg);
        container.appendChild(el);
      });
      scrollToBottom();
    });
}

function createMessageElement(msg) {
  const div = document.createElement('div');
  const isSent = msg.senderId === currentUser.uid;
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  const time = msg.timestamp ? formatTime(msg.timestamp.toDate()) : '';
  
  div.innerHTML = `
    <div class="message-avatar"><i class="fas fa-user"></i></div>
    <div class="message-content">
      <div class="message-text">${escapeHtml(msg.text)}</div>
      <div class="message-time">${time}</div>
    </div>
  `;
  return div;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  
  try {
    await db.collection('chats').doc(currentChatId).collection('messages').add({
      text: text,
      senderId: currentUser.uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      read: false
    });
    
    await db.collection('chats').doc(currentChatId).update({
      lastMessage: text,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    input.value = '';
    input.style.height = 'auto';
  } catch (error) {
    console.error('Send error:', error);
    showNotification('error', 'Ошибка', 'Не удалось отправить');
  }
}

function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  setTimeout(() => container.scrollTop = container.scrollHeight, 100);
}

async function searchUsers(query) {
  const list = document.getElementById('usersList');
  if (!query || query.length < 2) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Введите минимум 2 символа</p></div>';
    return;
  }
  
  try {
    const snapshot = await db.collection('users').get();
    const results = [];
    const searchLower = query.toLowerCase();
    
    snapshot.forEach((doc) => {
      const user = doc.data();
      if (user.uid === currentUser.uid) return;
      if (user.username.toLowerCase().includes(searchLower) || 
          user.name.toLowerCase().includes(searchLower)) {
        results.push(user);
      }
    });
    
    if (results.length === 0) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Не найдено</p></div>';
      return;
    }
    
    list.innerHTML = '';
    results.forEach(user => {
      const el = createUserElement(user);
      list.appendChild(el);
    });
  } catch (error) {
    console.error('Search error:', error);
  }
}

function createUserElement(user) {
  const div = document.createElement('div');
  div.className = 'user-item';
  div.innerHTML = `
    <div class="user-avatar"><i class="fas fa-user"></i></div>
    <div class="user-item-info">
      <h4>${escapeHtml(user.name)}</h4>
      <p>@${escapeHtml(user.username)}</p>
    </div>
  `;
  div.onclick = async () => {
    const chatId = await createOrOpenChat(user);
    if (chatId) {
      closeDialog('newChatDialog');
      openChat(chatId, user);
    }
  };
  return div;
}

async function createOrOpenChat(otherUser) {
  try {
    const snapshot = await db.collection('chats')
      .where('participants', 'array-contains', currentUser.uid).get();
    
    let existingId = null;
    snapshot.forEach((doc) => {
      const chat = doc.data();
      if (chat.participants.includes(otherUser.uid)) existingId = doc.id;
    });
    
    if (existingId) return existingId;
    
    const chatId = [currentUser.uid, otherUser.uid].sort().join('_');
    await db.collection('chats').doc(chatId).set({
      participants: [currentUser.uid, otherUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: null,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return chatId;
  } catch (error) {
    console.error('Create chat error:', error);
    return null;
  }
}

function openNewChatDialog() {
  openDialog('newChatDialog');
  document.getElementById('searchUsers').value = '';
  document.getElementById('usersList').innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Введите username</p></div>';
}

function openProfileDialog() {
  openDialog('profileDialog');
}

function openDialog(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeDialog(id) {
  document.getElementById(id).classList.add('hidden');
}

function escapeHtml(text) {
  const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}.${m}.${date.getFullYear()}`;
  } else if (hours > 0) {
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  } else if (mins > 0) {
    return `${mins} мин назад`;
  } else {
    return 'только что';
  }
}

function showNotification(type, title, message) {
  const container = document.getElementById('notifications');
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };
  
  notif.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <div class="notification-content">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  
  container.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

window.addEventListener('beforeunload', async () => {
  if (currentUser) await updateUserStatus('offline');
  if (chatsUnsubscribe) chatsUnsubscribe();
  if (messagesUnsubscribe) messagesUnsubscribe();
});
