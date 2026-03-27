const { NotFoundError } = require('../errors');

class FiltersService {
  constructor(repo, deps) {
    this.repo = repo;
    this.deps = deps;
  }

  list(userId) {
    return this.repo.findAll(userId);
  }

  create(userId, data) {
    const pos = this.deps.getNextPosition('saved_filters');
    return this.repo.create(data, pos, userId);
  }

  update(id, userId, data) {
    const ex = this.repo.findById(id, userId);
    if (!ex) throw new NotFoundError('Filter');
    return this.repo.update(id, userId, data);
  }

  remove(id, userId) {
    this.repo.remove(id, userId);
  }
}

module.exports = FiltersService;
