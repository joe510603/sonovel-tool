/**
 * IndexedDB Mock for Jest Testing
 * 使用 fake-indexeddb 提供 IndexedDB 环境
 */

// 导入 fake-indexeddb 模块
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

// 设置全局 IndexedDB 对象
global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// 每个测试前重置数据库
beforeEach(async () => {
  // 清理所有数据库
  try {
    const databases = await global.indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        global.indexedDB.deleteDatabase(db.name);
      }
    }
  } catch (error) {
    // 忽略清理错误
  }
});