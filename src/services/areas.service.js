const { NotFoundError, ValidationError } = require('../errors');

class AreasService {
  constructor(repo, deps) {
    this.repo = repo;
    this.deps = deps;
  }

  list(userId, includeArchived) {
    return this.repo.findAllWithCounts(userId, includeArchived);
  }

  create(userId, data) {
    const pos = this.deps.getNextPosition('life_areas');
    return this.repo.create(data, pos, userId);
  }

  update(id, userId, data) {
    const ex = this.repo.findById(id, userId);
    if (!ex) throw new NotFoundError('Area');
    return this.repo.update(id, userId, data);
  }

  archive(id, userId) {
    const ex = this.repo.findById(id, userId);
    if (!ex) throw new NotFoundError('Area');
    return this.repo.setArchived(id, userId, true);
  }

  unarchive(id, userId) {
    const ex = this.repo.findById(id, userId);
    if (!ex) throw new NotFoundError('Area');
    return this.repo.setArchived(id, userId, false);
  }

  remove(id, userId) {
    const result = this.repo.remove(id, userId);
    if (result.changes === 0) throw new NotFoundError('Area');
  }

  reorder(items, userId) {
    for (const i of items) {
      if (!Number.isInteger(i.id) || !Number.isInteger(i.position) || i.position < 0) {
        throw new ValidationError('Each item must have integer id and non-negative integer position');
      }
    }
    this.repo.reorder(items, userId);
  }

  // Goals
  listGoals(areaId, userId) {
    return this.repo.findGoalsForArea(areaId, userId);
  }

  createGoal(areaId, userId, data) {
    const area = this.repo.findById(areaId, userId);
    if (!area) throw new NotFoundError('Area');
    const pos = this.deps.getNextPosition('goals', 'area_id', areaId);
    return this.repo.createGoal(areaId, data, pos, userId);
  }

  updateGoal(id, userId, data) {
    const g = this.repo.findGoalById(id, userId);
    if (!g) throw new NotFoundError('Goal');
    return this.repo.updateGoal(id, userId, data);
  }

  removeGoal(id, userId) {
    const result = this.repo.removeGoal(id, userId);
    if (result.changes === 0) throw new NotFoundError('Goal');
  }

  allGoals(userId, opts) {
    return this.repo.findAllGoals(userId, opts);
  }

  // Milestones
  listMilestones(goalId, userId) {
    const goal = this.repo.findGoalById(goalId, userId);
    if (!goal) throw new NotFoundError('Goal');
    return this.repo.findMilestones(goalId);
  }

  createMilestone(goalId, userId, title) {
    const goal = this.repo.findGoalById(goalId, userId);
    if (!goal) throw new NotFoundError('Goal');
    const pos = this.deps.getNextPosition('goal_milestones', 'goal_id', goalId);
    return this.repo.createMilestone(goalId, title, pos);
  }

  updateMilestone(id, userId, data) {
    const ex = this.repo.findMilestoneOwned(id, userId);
    if (!ex) throw new NotFoundError('Milestone');
    return this.repo.updateMilestone(id, userId, data, ex);
  }

  removeMilestone(id, userId) {
    const ex = this.repo.findMilestoneOwned(id, userId);
    if (!ex) throw new NotFoundError('Milestone');
    this.repo.removeMilestone(id);
  }

  goalProgress(id, userId) {
    const goal = this.repo.findGoalById(id, userId);
    if (!goal) throw new NotFoundError('Goal');
    const tasks = this.repo.getGoalProgress(id);
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const milestones = this.repo.findMilestones(id);
    return { goal, tasks, total, done, milestones };
  }
}

module.exports = AreasService;
