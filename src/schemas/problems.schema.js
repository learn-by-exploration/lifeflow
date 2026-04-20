const { z } = require('zod');

// ─── Valid enums ───
const PHASES = ['capture', 'diagnose', 'explore', 'decide', 'act', 'review', 'resolved', 'shelved'];
const STATUSES = ['active', 'paused', 'resolved', 'abandoned', 'shelved'];
const PRIVACY_LEVELS = ['normal', 'private', 'encrypted'];
const CATEGORIES = [
  'uncategorized', 'career', 'relationships', 'financial', 'health', 'health_wellness',
  'personal_growth', 'education', 'home', 'creative', 'social', 'existential',
];
const EMOTIONAL_STATES = [
  'anxious', 'overwhelmed', 'stuck', 'frustrated', 'scared', 'confused',
  'angry', 'sad', 'guilty', 'hopeful', 'numb', 'uncertain', 'conflicted',
  'ashamed', 'relieved', 'confident', 'determined', 'calm',
];
const ENTRY_TYPES = [
  'reflection', 'insight', 'question', 'breakthrough', 'setback',
  'observation', 'lesson', 'phase_transition', 'values_clarification',
];
const OPTION_SOURCES = ['user', 'ai'];
const LINK_TYPES = ['related', 'causes', 'blocks', 'child_of', 'duplicate'];
const ACTION_STATUSES = ['pending', 'in_progress', 'done', 'skipped'];
const PROBLEM_TYPES = ['solve', 'decide', 'process', 'unclassified'];
const STAKEHOLDER_INFLUENCE = ['high', 'medium', 'low'];
const STAKEHOLDER_IMPACT = ['high', 'medium', 'low'];
const SHELVE_REASONS = [
  'waiting_for_info', 'not_mine_to_solve', 'accepted_situation',
  'lower_priority', 'need_professional_help', 'other',
];

// ─── Emotional State Clusters (Life Coach: 18 states → 8 clusters) ───
const EMOTIONAL_CLUSTERS = {
  fear: { label: 'Fear & Anxiety', description: 'Feeling threatened or worried', states: ['anxious', 'scared', 'overwhelmed'] },
  confusion: { label: 'Confusion & Uncertainty', description: 'Unable to see clearly or find direction', states: ['confused', 'uncertain', 'stuck'] },
  frustration: { label: 'Frustration & Anger', description: 'Feeling blocked or opposed', states: ['frustrated', 'angry', 'conflicted'] },
  sadness: { label: 'Sadness & Grief', description: 'Feeling loss or disconnection', states: ['sad', 'numb', 'guilty'] },
  shame: { label: 'Shame & Self-Doubt', description: 'Feeling inadequate or exposed', states: ['ashamed', 'guilty'] },
  hope: { label: 'Hope & Optimism', description: 'Seeing a path forward', states: ['hopeful', 'relieved'] },
  confidence: { label: 'Confidence & Clarity', description: 'Feeling capable and clear', states: ['confident', 'determined', 'calm'] },
  resolve: { label: 'Determination & Drive', description: 'Ready to act', states: ['determined', 'confident'] },
};

// ─── Crisis Detection (Clinical Psychologist: non-negotiable safety net) ───
const CRISIS_EMOTIONAL_COMBOS = [
  ['numb', 'ashamed', 'sad'],
  ['numb', 'sad', 'stuck'],
  ['numb', 'ashamed'],
  ['overwhelmed', 'numb'],
  ['scared', 'numb', 'sad'],
];
const CRISIS_KEYWORDS = [
  'hopeless', 'end it', 'no way out', 'can\'t go on', 'give up',
  'worthless', 'no point', 'better off without', 'suicide', 'self-harm',
  'kill myself', 'want to die', 'no reason to live',
];
const CRISIS_RESOURCES = {
  banner: 'If you\'re experiencing a crisis, please reach out for support. You are not alone.',
  resources: [
    { name: 'National Crisis Helpline (India)', number: '9152987821', type: 'phone' },
    { name: 'iCall (India)', number: '9152987821', type: 'phone' },
    { name: 'Vandrevala Foundation (India)', number: '1860-2662-345', type: 'phone' },
    { name: 'Crisis Text Line', number: 'Text HOME to 741741', type: 'text' },
    { name: 'International Association for Suicide Prevention', url: 'https://www.iasp.info/resources/Crisis_Centres/', type: 'web' },
  ],
  disclaimer: 'Synclyf is not a substitute for professional mental health support. If you are in immediate danger, please contact emergency services.',
};

// ─── Reframe Scaffolding (Life Coach: sentence starters prevent garbage reframes) ───
const REFRAME_STARTERS = [
  { id: 'perspective', text: 'What if the real problem is...', description: 'Challenge your initial framing' },
  { id: 'friend', text: 'If a friend described this, I\'d say the actual issue is...', description: 'Distance yourself from the emotion' },
  { id: 'future', text: 'In 5 years, I\'ll probably see this as...', description: 'Temporal distancing' },
  { id: 'opposite', text: 'The opposite view would be...', description: 'Consider the contrary' },
  { id: 'advisor', text: 'A wise mentor would tell me...', description: 'Access your inner wisdom' },
  { id: 'growth', text: 'What this situation is teaching me is...', description: 'Growth mindset reframe' },
  { id: 'control', text: 'The part of this I can actually control is...', description: 'Focus on your circle of influence' },
  { id: 'values', text: 'What matters most to me here is...', description: 'Values-based perspective' },
];

// ─── Problem Templates (PM + Sales: reduce blank-page anxiety) ───
const PROBLEM_TEMPLATES = [
  {
    id: 'job_decision',
    title: 'Should I take this job/opportunity?',
    category: 'career',
    problem_type: 'decide',
    description: 'I\'m weighing a career opportunity and need to think through the decision carefully.',
    suggested_stakeholders: ['Partner/Spouse', 'Current Manager', 'Mentor'],
    suggested_options: ['Accept the offer', 'Negotiate terms', 'Decline and stay', 'Ask for time to decide'],
  },
  {
    id: 'conflict_resolution',
    title: 'How do I handle this conflict?',
    category: 'relationships',
    problem_type: 'solve',
    description: 'I\'m in a conflict situation and need to find a constructive path forward.',
    suggested_stakeholders: ['The other person', 'Mediator/Mutual friend'],
    suggested_options: ['Have a direct conversation', 'Write a letter/message', 'Seek mediation', 'Set boundaries and distance'],
  },
  {
    id: 'health_decision',
    title: 'What should I do about my health concern?',
    category: 'health',
    problem_type: 'decide',
    description: 'I need to make a decision about a health matter that affects my daily life.',
    suggested_stakeholders: ['Doctor/Specialist', 'Family member', 'Insurance provider'],
    suggested_options: ['Seek a second opinion', 'Follow recommended treatment', 'Try lifestyle changes first', 'Research alternatives'],
  },
  {
    id: 'financial_decision',
    title: 'Should I make this financial commitment?',
    category: 'financial',
    problem_type: 'decide',
    description: 'I\'m facing a significant financial decision and want to think it through.',
    suggested_stakeholders: ['Partner/Spouse', 'Financial advisor', 'Bank/Lender'],
    suggested_options: ['Commit now', 'Wait and save more', 'Find a cheaper alternative', 'Split the cost'],
  },
  {
    id: 'life_transition',
    title: 'I\'m going through a major life change',
    category: 'personal_growth',
    problem_type: 'process',
    description: 'A significant change is happening and I need to process my feelings and plan my response.',
    suggested_stakeholders: ['Close friend', 'Family', 'Therapist/Counselor'],
    suggested_options: [],
  },
  {
    id: 'stuck_feeling',
    title: 'I feel stuck and don\'t know why',
    category: 'existential',
    problem_type: 'process',
    description: 'Something isn\'t right but I can\'t pinpoint what it is. I need space to explore.',
    suggested_stakeholders: [],
    suggested_options: [],
  },
];

// ─── Problems ───
const createProblem = z.object({
  title: z.string().trim().min(1, 'Title required').max(300, 'Title too long (max 300)'),
  description: z.string().max(10000).nullable().optional().default(''),
  category: z.enum(CATEGORIES).optional().default('uncategorized'),
  problem_type: z.enum(PROBLEM_TYPES).optional().default('unclassified'),
  emotional_state: z.string().max(200).nullable().optional().default(null),
  urgency: z.coerce.number().int().min(0).max(3).optional().default(0),
  importance: z.coerce.number().int().min(0).max(3).optional().default(0),
  privacy_level: z.enum(PRIVACY_LEVELS).optional().default('normal'),
  deadline: z.string().nullable().optional().default(null),
  stakeholders: z.string().max(500).nullable().optional().default(null),
  goal_id: z.coerce.number().int().positive().nullable().optional().default(null),
});

const updateProblem = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
  problem_type: z.enum(PROBLEM_TYPES).optional(),
  emotional_state: z.string().max(200).nullable().optional(),
  urgency: z.coerce.number().int().min(0).max(3).optional(),
  importance: z.coerce.number().int().min(0).max(3).optional(),
  privacy_level: z.enum(PRIVACY_LEVELS).optional(),
  deadline: z.string().nullable().optional(),
  stakeholders: z.string().max(500).nullable().optional(),
  goal_id: z.coerce.number().int().positive().nullable().optional(),
  validated: z.coerce.number().int().min(0).max(1).optional(),
});

const updatePhase = z.object({
  phase: z.enum(PHASES),
  reflection: z.string().max(5000).optional(),
  emotional_state: z.string().max(200).nullable().optional(),
});

const archiveProblem = z.object({
  shelve_reason: z.enum(SHELVE_REASONS).optional().default('other'),
  shelve_notes: z.string().max(2000).optional(),
});

const queryProblems = z.object({
  status: z.enum(STATUSES).optional(),
  phase: z.enum(PHASES).optional(),
  category: z.enum(CATEGORIES).optional(),
  privacy_level: z.enum(PRIVACY_LEVELS).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['created_at', 'updated_at', 'title', 'urgency', 'importance']).optional().default('updated_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ─── Reframes ───
const createReframe = z.object({
  reframe_text: z.string().trim().min(1, 'Reframe text required').max(2000),
  source: z.enum(OPTION_SOURCES).optional().default('user'),
});

// ─── Options ───
const createOption = z.object({
  title: z.string().trim().min(1, 'Title required').max(300),
  description: z.string().max(5000).nullable().optional().default(''),
  pros: z.string().max(5000).nullable().optional().default(''),
  cons: z.string().max(5000).nullable().optional().default(''),
  effort: z.coerce.number().int().min(1).max(5).nullable().optional().default(null),
  impact: z.coerce.number().int().min(1).max(5).nullable().optional().default(null),
  risk: z.coerce.number().int().min(1).max(5).nullable().optional().default(null),
  emotional_fit: z.coerce.number().int().min(1).max(5).nullable().optional().default(null),
  source: z.enum(OPTION_SOURCES).optional().default('user'),
});

const updateOption = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  pros: z.string().max(5000).nullable().optional(),
  cons: z.string().max(5000).nullable().optional(),
  effort: z.coerce.number().int().min(1).max(5).nullable().optional(),
  impact: z.coerce.number().int().min(1).max(5).nullable().optional(),
  risk: z.coerce.number().int().min(1).max(5).nullable().optional(),
  emotional_fit: z.coerce.number().int().min(1).max(5).nullable().optional(),
});

// ─── Decisions ───
const createDecision = z.object({
  chosen_option_id: z.coerce.number().int().positive().nullable().optional().default(null),
  rationale: z.string().max(5000).nullable().optional().default(''),
  confidence: z.coerce.number().int().min(1).max(5).optional().default(3),
  revisit_date: z.string().nullable().optional().default(null),
});

const updateDecision = z.object({
  chosen_option_id: z.coerce.number().int().positive().nullable().optional(),
  rationale: z.string().max(5000).nullable().optional(),
  confidence: z.coerce.number().int().min(1).max(5).optional(),
  revisit_date: z.string().nullable().optional(),
});

// ─── Actions ───
const createAction = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1, 'Description required').max(1000).optional(),
  due_date: z.string().nullable().optional().default(null),
  decision_id: z.coerce.number().int().positive().nullable().optional().default(null),
  spawn_task: z.boolean().optional().default(false),
}).refine(d => d.title || d.description, { message: 'Either title or description is required' });

const updateAction = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(ACTION_STATUSES).optional(),
});

// ─── Journal ───
const createJournalEntry = z.object({
  content: z.string().trim().min(1, 'Content required').max(10000),
  phase: z.enum(PHASES).optional(),
  entry_type: z.enum(ENTRY_TYPES).optional().default('reflection'),
  emotional_state: z.string().max(200).nullable().optional().default(null),
});

// ─── Links ───
const createLink = z.object({
  linked_problem_id: z.coerce.number().int().positive(),
  link_type: z.enum(LINK_TYPES).optional().default('related'),
});

// ─── Tags ───
const addTag = z.object({
  tag_id: z.coerce.number().int().positive().optional(),
  tag: z.string().trim().min(1).max(100).optional(),
}).refine(d => d.tag_id || d.tag, { message: 'Either tag_id or tag (name) is required' });

// ─── Stakeholders ───
const createStakeholder = z.object({
  name: z.string().trim().min(1, 'Name required').max(200),
  role: z.string().max(200).nullable().optional().default(null),
  influence: z.enum(STAKEHOLDER_INFLUENCE).nullable().optional().default(null),
  impact: z.enum(STAKEHOLDER_IMPACT).nullable().optional().default(null),
  notes: z.string().max(2000).nullable().optional().default(null),
});

const updateStakeholder = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  role: z.string().max(200).nullable().optional(),
  influence: z.enum(STAKEHOLDER_INFLUENCE).nullable().optional(),
  impact: z.enum(STAKEHOLDER_IMPACT).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Dormant Problems Query ───
const queryDormant = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(14),
});

module.exports = {
  PHASES, STATUSES, PRIVACY_LEVELS, CATEGORIES, EMOTIONAL_STATES,
  ENTRY_TYPES, OPTION_SOURCES, LINK_TYPES, ACTION_STATUSES,
  PROBLEM_TYPES, SHELVE_REASONS,
  EMOTIONAL_CLUSTERS, CRISIS_EMOTIONAL_COMBOS, CRISIS_KEYWORDS, CRISIS_RESOURCES,
  REFRAME_STARTERS, PROBLEM_TEMPLATES,
  STAKEHOLDER_INFLUENCE, STAKEHOLDER_IMPACT,
  createProblem, updateProblem, updatePhase, queryProblems, archiveProblem,
  createReframe,
  createOption, updateOption,
  createDecision, updateDecision,
  createAction, updateAction,
  createJournalEntry,
  createLink, addTag,
  createStakeholder, updateStakeholder, queryDormant,
};
