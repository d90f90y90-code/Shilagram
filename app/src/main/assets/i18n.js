(function (G) {
  'use strict';
  const D = {
    ar: {
      appName: 'Shilagram', myKey: 'مفتاحي: ', noChats: 'لا توجد محادثات.<br>اضغط 🔍 للبحث عن صديق بمفتاحه، أو 📷 لمسح QR، أو 👥 لإنشاء مجموعة.',
      online: 'متصل الآن', offline: 'غير متصل', members: ' أعضاء', sticker: '🖼 ملصق', photo: '📷 صورة', voice: '🎤 رسالة صوتية', file: '📎 ملف', deleted: 'تم حذف هذه الرسالة', edited: 'معدّلة',
      connecting: 'جاري الاتصال…', libFail: 'تعذر تحميل مكتبة الاتصال', serverLost: 'انقطع الاتصال بالخادم…', keyBusy: 'مفتاحك مفتوح في جهاز آخر', noNet: 'لا يوجد اتصال بالإنترنت',
      typeMsg: 'اكتب رسالة', askName: 'ما اسمك؟', user: 'مستخدم',
      profile: 'ملفي', profileP: 'مفتاحك السري. أعطه لأصدقائك ليجدوك به:', copyKey: 'نسخ المفتاح', copied: 'تم النسخ', yourName: 'اسمك', saveName: 'حفظ الاسم', showQR: 'عرض رمز QR', hideQR: 'إخفاء الرمز',
      fingerprintMine: 'بصمة أمانك', backup: 'نسخة احتياطية', backupP: 'تحفظ هويتك ومحادثاتك في ملف مشفّر بكلمة مرور.', exportBtn: 'تصدير', importBtn: 'استيراد', pass: 'كلمة المرور', passAsk: 'اكتب كلمة مرور للملف (لا يمكن استرجاعها):', passAsk2: 'كلمة مرور الملف:',
      exportDone: 'تم التصدير', importDone: 'تم الاستيراد، سيُعاد تشغيل التطبيق', importBad: 'كلمة المرور خاطئة أو الملف تالف',
      lang: 'اللغة', ice: 'خوادم الاتصال (STUN/TURN) بصيغة JSON', iceSave: 'حفظ وإعادة الاتصال', battery: 'إبقاء التطبيق يعمل في الخلفية', notif: 'الإشعارات',
      findFriend: 'البحث عن صديق', findP: 'اكتب مفتاحه (6 أحرف كبيرة و4 أرقام). يجب أن يكون التطبيق مفتوحا عنده.', search: 'بحث', addAnyway: 'إضافة على أي حال', searching: 'جاري البحث…',
      badKey: 'المفتاح غير صحيح', yourOwn: 'هذا مفتاحك أنت', notFound: 'لم يتم العثور عليه الآن. ربما التطبيق مغلق عنده.',
      newGroup: 'مجموعة جديدة', groupName: 'اسم المجموعة', addFriendsFirst: 'أضف أصدقاء أولا.', create: 'إنشاء', groupNeed: 'اكتب اسما واختر عضوا واحدا على الأقل',
      stickerMaker: 'صنع ملصق', pickPhoto: 'اختيار صورة من الهاتف', square: 'مربع', rounded: 'مدور', circle: 'دائرة', stickerText: 'نص على الملصق (اختياري)', saveSticker: 'حفظ الملصق', pickFirst: 'اختر صورة أولا',
      close: 'إغلاق', ok: 'حسنا', cancel: 'إلغاء', saveSt: 'حفظ الملصق في مجموعتك؟', delSt: 'حذف الملصق؟', delChat: 'حذف هذه المحادثة من جهازك؟', memFull: 'الذاكرة ممتلئة',
      scanQR: 'مسح QR', scanP: 'وجّه الكاميرا نحو رمز صديقك', noCam: 'تعذر فتح الكاميرا', qrBad: 'هذا ليس رمز Shilagram',
      reply: 'رد', edit: 'تعديل', delMe: 'حذف عندي', delAll: 'حذف عند الجميع', save: 'حفظ في الجهاز', cancelAct: 'إلغاء', replyingTo: 'رد على',
      attach: 'إرفاق', pickImage: 'صورة', pickFile: 'ملف', tooBig: 'الملف كبير (الحد 10 ميجا)', rec: 'جاري التسجيل… اضغط للإرسال', noMic: 'تعذر الوصول للميكروفون',
      security: 'الأمان', secP: 'قارن هذه البصمة مع صديقك (بمكالمة أو لقاء) للتأكد أن لا أحد ينتحل شخصيته.', theirPrint: 'بصمة صديقك', notVerified: 'لم يتصل بعد',
      resetTrust: 'إعادة الثقة بهوية جديدة', keyChanged: 'تحذير: تغيّرت هوية الأمان لـ ', keyChangedHelp: 'قد يكون صديقك غيّر جهازه، أو شخص ينتحل شخصيته. تأكد منه ثم أعد الثقة من قائمة الأمان.',
      voiceCall: 'مكالمة صوتية', videoCall: 'مكالمة فيديو', incoming: 'مكالمة واردة من ', accept: 'رد', decline: 'رفض', hangup: 'إنهاء', mute: 'كتم', calling: 'جاري الاتصال…', callFail: 'فشلت المكالمة', callNeedOnline: 'الصديق غير متصل',
      msgFrom: 'رسالة من ', secure: '🔒 مشفّرة من طرف لطرف', unsecure: 'جاري تأمين الاتصال…', done: 'تم'
    },
    en: {
      appName: 'Shilagram', myKey: 'My key: ', noChats: 'No chats yet.<br>Tap 🔍 to find a friend by key, 📷 to scan a QR, or 👥 to create a group.',
      online: 'online', offline: 'offline', members: ' members', sticker: '🖼 Sticker', photo: '📷 Photo', voice: '🎤 Voice message', file: '📎 File', deleted: 'This message was deleted', edited: 'edited',
      connecting: 'Connecting…', libFail: 'Could not load the connection library', serverLost: 'Lost connection to the server…', keyBusy: 'Your key is open on another device', noNet: 'No internet connection',
      typeMsg: 'Type a message', askName: 'What is your name?', user: 'User',
      profile: 'My profile', profileP: 'Your secret key. Give it to friends so they can find you:', copyKey: 'Copy key', copied: 'Copied', yourName: 'Your name', saveName: 'Save name', showQR: 'Show QR code', hideQR: 'Hide QR code',
      fingerprintMine: 'Your security fingerprint', backup: 'Backup', backupP: 'Saves your identity and chats in a file encrypted with a password.', exportBtn: 'Export', importBtn: 'Import', pass: 'Password', passAsk: 'Choose a password for the file (it cannot be recovered):', passAsk2: 'File password:',
      exportDone: 'Exported', importDone: 'Imported, the app will restart', importBad: 'Wrong password or corrupted file',
      lang: 'Language', ice: 'Connection servers (STUN/TURN) as JSON', iceSave: 'Save and reconnect', battery: 'Keep the app running in background', notif: 'Notifications',
      findFriend: 'Find a friend', findP: 'Enter their key (6 capital letters and 4 digits). The app must be open on their side.', search: 'Search', addAnyway: 'Add anyway', searching: 'Searching…',
      badKey: 'Invalid key', yourOwn: 'This is your own key', notFound: 'Not found right now. Their app may be closed.',
      newGroup: 'New group', groupName: 'Group name', addFriendsFirst: 'Add friends first.', create: 'Create', groupNeed: 'Enter a name and choose at least one member',
      stickerMaker: 'Make a sticker', pickPhoto: 'Pick a photo from the phone', square: 'Square', rounded: 'Rounded', circle: 'Circle', stickerText: 'Sticker text (optional)', saveSticker: 'Save sticker', pickFirst: 'Pick a photo first',
      close: 'Close', ok: 'OK', cancel: 'Cancel', saveSt: 'Save this sticker to your collection?', delSt: 'Delete sticker?', delChat: 'Delete this chat from your device?', memFull: 'Storage is full',
      scanQR: 'Scan QR', scanP: "Point the camera at your friend's code", noCam: 'Could not open the camera', qrBad: 'Not a Shilagram code',
      reply: 'Reply', edit: 'Edit', delMe: 'Delete for me', delAll: 'Delete for everyone', save: 'Save to device', cancelAct: 'Cancel', replyingTo: 'Replying to',
      attach: 'Attach', pickImage: 'Photo', pickFile: 'File', tooBig: 'File is too large (10 MB max)', rec: 'Recording… tap to send', noMic: 'Could not access the microphone',
      security: 'Security', secP: 'Compare this fingerprint with your friend (in a call or in person) to be sure nobody is impersonating them.', theirPrint: "Friend's fingerprint", notVerified: 'Has not connected yet',
      resetTrust: 'Trust a new identity', keyChanged: 'Warning: security identity changed for ', keyChangedHelp: 'Your friend may have changed device, or someone is impersonating them. Verify with them, then reset trust from the Security menu.',
      voiceCall: 'Voice call', videoCall: 'Video call', incoming: 'Incoming call from ', accept: 'Answer', decline: 'Decline', hangup: 'Hang up', mute: 'Mute', calling: 'Calling…', callFail: 'Call failed', callNeedOnline: 'Friend is offline',
      msgFrom: 'Message from ', secure: '🔒 End-to-end encrypted', unsecure: 'Securing connection…', done: 'Done'
    }
  };
  let cur = 'ar';
  G.I18N = {
    set(l) { cur = D[l] ? l : 'ar'; document.documentElement.lang = cur; document.documentElement.dir = cur === 'ar' ? 'rtl' : 'ltr'; },
    get lang() { return cur; },
    detect() { return (navigator.language || 'ar').toLowerCase().startsWith('ar') ? 'ar' : 'en'; }
  };
  G.t = k => (D[cur][k] !== undefined ? D[cur][k] : k);
})(window);
