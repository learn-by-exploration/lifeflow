const { NotFoundError, ConflictError, ValidationError } = require('../errors');

class TagsService {
  constructor(tagsRepo, deps) {
    this.repo = tagsRepo;
    this.deps = deps;
  }

  list(userId) {
    return this.repo.findAll(userId);
  }

  create(userId, { name, color }) {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '');
    const existing = this.repo.findByName(clean, userId);
    if (existing) return { tag: existing, created: false };
    const tag = this.repo.create(clean, color, userId);
    return { tag, created: true };
  }

  stats(userId) {
    return this.repo.stats(userId);
  }

  update(id, userId, { name, color }) {
    const tag = this.repo.findById(id, userId);
    if (!tag) throw new NotFoundError('Tag');

    if (name !== undefined) {
      const clean = String(name).trim().toLowerCase().replace(/[^a-z0-9\-_ ]/g, '');
      if (!clean) throw new ValidationError('Name required');
      const dup = this.repo.findDuplicate(clean, id, userId);
      if (dup) throw new ConflictError('Tag name already exists');
      this.repo.updateName(id, clean, userId);
    }
    if (color !== undefined) {
      this.repo.updateColor(id, color, userId);
    }

    return this.repo.findById(id, userId);
  }

  remove(id, userId) {
    this.repo.remove(id, userId);
  }

  setTaskTags(taskId, userId, tagIds) {
    const task = this.deps.db.prepare('SELECT id FROM tasks WHERE id=? AND user_id=?').get(taskId, userId);
    if (!task) throw new NotFoundError('Task');
    this.repo.setTaskTags(taskId, tagIds);
    return this.deps.getTaskTags(taskId);
  }
}

module.exports = TagsService;
