// =====================================================
// RUGRAM - ПОЛНЫЙ РАБОЧИЙ КОД МЕССЕНДЖЕРА
// =====================================================

// ========== КОНФИГУРАЦИЯ FIREBASE ==========
const firebaseConfig = {
  apiKey: "AIzaSyDhCqJoxoiMAkVjaPvK4xQdPBmslhZcZCg",
  authDomain: "rugram-c8037.firebaseapp.com",
  projectId: "rugram-c8037",
  storageBucket: "rugram-c8037.firebasestorage.app",
  messagingSenderId: "320736302382",
  appId: "1:320736302382:web:374bbc5d89e842c39116bf",
  measurementId: "G-15JZLN4Y5M"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Включить оффлайн поддержку
db.enablePersistence().catch((err) => {
  console.warn('Persistence error:', err.code);
});

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let currentUser = null;
let currentChatId = null;
let currentChatUser = null;
let chatsUnsubscribe = null;
let messagesUnsubscribe = null;

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 RUGRAM запускается...');
  initApp();
});

function initApp() {
  showScreen('splashScreen');
  
  // Слушаем изменения авторизации
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      console.log('✅ Пользователь авторизован:', user.email);
      currentUser = user;
      await updateUserStatus('online');
      await loadUserProfile();
      showScreen('mainScreen');
      loadChats();
      startLastSeenUpdater();
    } else {
      console.log('❌ Пользователь не авторизован');
      currentUser = null;
      setTimeout(() => showScreen('authScreen'), 2000);
    }
  });
}

// ========== УПРАВЛЕНИЕ ЭКРАНАМИ ==========
function showScreen(screenId) {
  const screens = ['splashScreen', 'authScreen', 'mainScreen'];
  screens.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.toggle('hidden', id !== screenId);
    }
  });
  console.log('📱 Показан экран:', screenId);
}

// ========== АВТОРИЗАЦИЯ ==========

function showLogin() {
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
}

function showRegister() {
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
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
    let message = 'Ошибка входа';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      message = 'Неверный email или пароль';
    } else if (error.code === 'auth/invalid-email') {
      message = 'Неверный формат email';
    }
    showNotification('error', 'Ошибка', message);
  }
}

async function handleRegister() {
  const name = document.getElementById('registerName').value.trim();
  const username = document.getElementById('registerUsername').value.trim().toLowerCase();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerPasswordConfirm').value;
  
  // Валидация
  if (!name || !username || !email || !password || !confirm) {
    showNotification('error', 'Ошибка', 'Заполните все поля');
    return;
  }
  
  if (username.length < 3) {
    showNotification('error', 'Ошибка', 'Username должен быть минимум 3 символа');
    return;
  }
  
  if (!/^[a-z0-9_]+$/.test(username)) {
    showNotification('error', 'Ошибка', 'Username может содержать только a-z, 0-9 и _');
    return;
  }
  
  if (password.length < 6) {
    showNotification('error', 'Ошибка', 'Пароль должен быть минимум 6 символов');
    return;
  }
  
  if (password !== confirm) {
    showNotification('error', 'Ошибка', 'Пароли не совпадают');
    return;
  }
  
  try {
    // Проверка уникальности username
    const usernameQuery = await db.collection('users')
      .where('username', '==', username)
      .get();
    
    if (!usernameQuery.empty) {
      showNotification('error', 'Ошибка', 'Этот username уже занят');
      return;
    }
    
    // Создание аккаунта
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Сохранение данных
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
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
    let message = 'Ошибка регистрации';
    if (error.code === 'auth/email-already-in-use') {
      message = 'Этот email уже используется';
    } else if (error.code === 'auth/invalid-email') {
      message = 'Неверный формат email';
    }
    showNotification('error', 'Ошибка', message);
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
    showNotification('error', 'Ошибка', 'Не удалось выйти');
  }
}

// ========== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ==========

async function loadUserProfile() {
  try {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data();
    
    if (userData) {
      document.getElementById('sidebarName').textContent = userData.name;
      document.getElementById('sidebarUsername').textContent = `@${userData.username}`;
      document.getElementById('profileName').textContent = userData.name;
      document.getElementById('profileUsername').textContent = `@${userData.username}`;
      document.getElementById('profileEmail').textContent = userData.email;
      
      console.log('✅ Профиль загружен:', userData.name);
    }
  } catch (error) {
    console.error('Error loading profile:', error);
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
    console.error('Error updating status:', error);
  }
}

function startLastSeenUpdater() {
  setInterval(async () => {
    if (currentUser) {
      await db.collection('users').doc(currentUser.uid).update({
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }, 30000); // Каждые 30 секунд
}

// ========== ЧАТЫ ==========

function loadChats() {
  const chatsList = document.getElementById('chatsList');
  
  if (chatsUnsubscribe) chatsUnsubscribe();
  
  chatsUnsubscribe = db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid)
    .orderBy('lastMessageTime', 'desc')
    .onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        chatsList.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-comments"></i>
            <p>Нет активных чатов</p>
            <button class="btn-secondary" onclick="openNewChatDialog()">
              Начать общение
            </button>
          </div>
        `;
        return;
      }
      
      chatsList.innerHTML = '';
      
      for (const doc of snapshot.docs) {
        const chat = doc.data();
        const chatId = doc.id;
        
        const otherUserId = chat.participants.find(id => id !== currentUser.uid);
        const userDoc = await db.collection('users').doc(otherUserId).get();
        const otherUser = userDoc.data();
        
        const chatElement = createChatElement(chatId, otherUser, chat);
        chatsList.appendChild(chatElement);
      }
      
      console.log('✅ Загружено чатов:', snapshot.size);
    }, (error) => {
      console.error('Error loading chats:', error);
      showNotification('error', 'Ошибка', 'Не удалось загрузить чаты');
    });
}

function createChatElement(chatId, user, chat) {
  const div = document.createElement('div');
  div.className = 'chat-item';
  div.dataset.chatId = chatId;
  
  if (chatId === currentChatId) {
    div.classList.add('active');
  }
  
  const lastMessage = chat.lastMessage || 'Нет сообщений';
  const lastTime = chat.lastMessageTime ? formatTime(chat.lastMessageTime.toDate()) : '';
  
  div.innerHTML = `
    <div class="user-avatar">
      <i class="fas fa-user"></i>
    </div>
    <div class="chat-info">
      <div class="chat-info-header">
        <h4>${escapeHtml(user.name)}</h4>
        <span class="chat-time">${lastTime}</span>
      </div>
      <div class="chat-preview">${escapeHtml(lastMessage)}</div>
    </div>
  `;
  
  div.onclick = () => openChat(chatId, user);
  
  return div;
}

async function openChat(chatId, user) {
  currentChatId = chatId;
  currentChatUser = user;
  
  // Обновить активный чат
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.chatId === chatId);
  });
  
  // Показать область чата
  document.getElementById('emptyChat').classList.add('hidden');
  document.getElementById('activeChat').classList.remove('hidden');
  
  // Обновить шапку
  document.getElementById('chatName').textContent = user.name;
  const statusEl = document.getElementById('chatStatus');
  statusEl.textContent = user.status === 'online' ? 'онлайн' : 'был(а) недавно';
  if (user.status === 'online') {
    statusEl.classList.add('online');
  } else {
    statusEl.classList.remove('online');
  }
  
  // Загрузить сообщения
  loadMessages(chatId);
  
  // На мобильных скрыть sidebar
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('hidden-mobile');
  }
  
  console.log('✅ Открыт чат с:', user.name);
}

function closeActiveChat() {
  currentChatId = null;
  currentChatUser = null;
  
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
  }
  
  document.getElementById('emptyChat').classList.remove('hidden');
  document.getElementById('activeChat').classList.add('hidden');
  
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // На мобильных показать sidebar
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('hidden-mobile');
  }
}

function searchChats(query) {
  const items = document.querySelectorAll('.chat-item');
  const searchLower = query.toLowerCase();
  
  items.forEach(item => {
    const name = item.querySelector('h4').textContent.toLowerCase();
    const preview = item.querySelector('.chat-preview').textContent.toLowerCase();
    
    if (name.includes(searchLower) || preview.includes(searchLower)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

// ========== СООБЩЕНИЯ ==========

function loadMessages(chatId) {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = `
    <div class="messages-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Загрузка сообщений...</p>
    </div>
  `;
  
  if (messagesUnsubscribe) messagesUnsubscribe();
  
  messagesUnsubscribe = db.collection('chats')
    .doc(chatId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      container.innerHTML = '';
      
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-comment"></i>
            <p>Начните переписку</p>
          </div>
        `;
        return;
      }
      
      snapshot.forEach((doc) => {
        const message = doc.data();
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
      });
      
      scrollToBottom();
      console.log('✅ Загружено сообщений:', snapshot.size);
    }, (error) => {
      console.error('Error loading messages:', error);
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Ошибка загрузки сообщений</p>
        </div>
      `;
    });
}

function createMessageElement(message) {
  const div = document.createElement('div');
  const isSent = message.senderId === currentUser.uid;
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  
  const time = message.timestamp ? formatTime(message.timestamp.toDate()) : '';
  
  div.innerHTML = `
    <div class="message-avatar">
      <i class="fas fa-user"></i>
    </div>
    <div class="message-content">
      <div class="message-text">${escapeHtml(message.text)}</div>
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
    // Добавить сообщение
    await db.collection('chats')
      .doc(currentChatId)
      .collection('messages')
      .add({
        text: text,
        senderId: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    
    // Обновить последнее сообщение
    await db.collection('chats').doc(currentChatId).update({
      lastMessage: text,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    input.value = '';
    input.style.height = 'auto';
    
    console.log('✅ Сообщение отправлено');
  } catch (error) {
    console.error('Error sending message:', error);
    showNotification('error', 'Ошибка', 'Не удалось отправить сообщение');
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
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 100);
}

// ========== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ==========

async function searchUsers(query) {
  const usersList = document.getElementById('usersList');
  
  if (!query || query.length < 2) {
    usersList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>Введите минимум 2 символа</p>
      </div>
    `;
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
      usersList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-users"></i>
          <p>Пользователи не найдены</p>
        </div>
      `;
      return;
    }
    
    usersList.innerHTML = '';
    results.forEach(user => {
      const userElement = createUserElement(user);
      usersList.appendChild(userElement);
    });
    
    console.log('✅ Найдено пользователей:', results.length);
  } catch (error) {
    console.error('Error searching users:', error);
    showNotification('error', 'Ошибка', 'Не удалось найти пользователей');
  }
}

function createUserElement(user) {
  const div = document.createElement('div');
  div.className = 'user-item';
  
  div.innerHTML = `
    <div class="user-avatar">
      <i class="fas fa-user"></i>
    </div>
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
    // Проверить существующий чат
    const snapshot = await db.collection('chats')
      .where('participants', 'array-contains', currentUser.uid)
      .get();
    
    let existingChatId = null;
    snapshot.forEach((doc) => {
      const chat = doc.data();
      if (chat.participants.includes(otherUser.uid)) {
        existingChatId = doc.id;
      }
    });
    
    if (existingChatId) {
      console.log('✅ Найден существующий чат:', existingChatId);
      return existingChatId;
    }
    
    // Создать новый чат
    const chatId = [currentUser.uid, otherUser.uid].sort().join('_');
    await db.collection('chats').doc(chatId).set({
      participants: [currentUser.uid, otherUser.uid],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: null,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Создан новый чат:', chatId);
    return chatId;
  } catch (error) {
    console.error('Error creating chat:', error);
    showNotification('error', 'Ошибка', 'Не удалось создать чат');
    return null;
  }
}

// ========== МОДАЛЬНЫЕ ОКНА ==========

function openNewChatDialog() {
  openDialog('newChatDialog');
  document.getElementById('searchUsers').value = '';
  document.getElementById('usersList').innerHTML = `
    <div class="empty-state">
      <i class="fas fa-users"></i>
      <p>Введите username или имя для поиска</p>
    </div>
  `;
}

function openProfileDialog() {
  openDialog('profileDialog');
}

function openDialog(dialogId) {
  document.getElementById(dialogId).classList.remove('hidden');
}

function closeDialog(dialogId) {
  document.getElementById(dialogId).classList.add('hidden');
}

function closeModalOnBackdrop(event, dialogId) {
  if (event.target.classList.contains('modal')) {
    closeDialog(dialogId);
  }
}

function toggleMenu() {
  // Можно добавить меню позже
  console.log('Toggle menu');
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

function formatTime(date) {
  if (!date) return '';
  
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${date.getFullYear()}`;
  } else if (hours > 0) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } else if (minutes > 0) {
    return `${minutes} мин назад`;
  } else {
    return 'только что';
  }
}

function showNotification(type, title, message) {
  const container = document.getElementById('notifications');
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };
  
  notification.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <div class="notification-content">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
  
  console.log(`${type.toUpperCase()}: ${title} - ${message}`);
}

// ========== ОЧИСТКА ПРИ ВЫГРУЗКЕ ==========

window.addEventListener('beforeunload', async () => {
  if (currentUser) {
    await updateUserStatus('offline');
  }
  if (chatsUnsubscribe) chatsUnsubscribe();
  if (messagesUnsubscribe) messagesUnsubscribe();
});

console.log('✅ RUGRAM готов к работе!');
