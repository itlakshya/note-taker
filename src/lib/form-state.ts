export type FollowUpType = "none" | "text" | "subcheckbox";
export type QuestionType = "text" | "dropdown" | "checkbox" | "subdropdown";

export type SubOption = {
  text: string;
};

export type Option = {
  id: string;
  text: string;
  followUp: FollowUpType;
  followRequired: boolean;
  subRequired: boolean;
  subOptions: SubOption[];
  childQuestions: Question[];
};

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  includeInCopy: boolean;
  options: Option[];
};

export type Category = {
  id: string;
  name: string;
};

export type CategoryQuestionGroup = {
  categoryId: string;
  questions: Question[];
};

export type Section = {
  id: string;
  title: string;
  categoryQuestions: CategoryQuestionGroup[];
};

export type FormState = {
  categories: Category[];
  sections: Section[];
};

const GENERAL_CATEGORY_ID = "general";
const GENERAL_CATEGORY_NAME = "General";

export function defaultState(): FormState {
  return { categories: [], sections: [] };
}

export function smartDefaultFollowUp(optionText: string): FollowUpType {
  const text = optionText.trim().toLowerCase();
  if (!text) return "none";
  if (text.includes("other")) return "text";
  return "none";
}

function normalizeQuestion(value: unknown): Question {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawOptions = Array.isArray(record.options) ? record.options : [];

  return {
    id: String(record.id ?? ""),
    type:
      record.type === "dropdown" ||
      record.type === "checkbox" ||
      record.type === "subdropdown"
        ? record.type
        : "text",
    label: String(record.label ?? ""),
    required: Boolean(record.required),
    includeInCopy: record.includeInCopy === undefined ? true : Boolean(record.includeInCopy),
    options: rawOptions.map((option) => {
      const optionRecord =
        option && typeof option === "object" ? (option as Record<string, unknown>) : {};
      const rawSubOptions = Array.isArray(optionRecord.subOptions)
        ? optionRecord.subOptions
        : [];
      const rawChildQuestions = Array.isArray(optionRecord.childQuestions)
        ? optionRecord.childQuestions
        : [];

      return {
        id: String(optionRecord.id ?? ""),
        text: String(optionRecord.text ?? ""),
        followUp:
          optionRecord.followUp === "text" || optionRecord.followUp === "subcheckbox"
            ? optionRecord.followUp
            : "none",
        followRequired: Boolean(optionRecord.followRequired),
        subRequired: Boolean(optionRecord.subRequired),
        subOptions: rawSubOptions.map((subOption) => {
          const subRecord =
            subOption && typeof subOption === "object"
              ? (subOption as Record<string, unknown>)
              : {};
          return { text: String(subRecord.text ?? "") };
        }),
        childQuestions: rawChildQuestions.map(normalizeQuestion),
      };
    }),
  };
}

export function getQuestionsForCategory(section: Section, categoryId: string) {
  return section.categoryQuestions.find((group) => group.categoryId === categoryId)?.questions ?? [];
}

export function normalizeState(value: unknown): FormState {
  if (!value || typeof value !== "object") return defaultState();

  const root = value as Record<string, unknown>;
  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  const hasCategories = Array.isArray(root.categories);

  const categories = hasCategories
    ? (root.categories as unknown[])
        .map((category) => {
          const record =
            category && typeof category === "object"
              ? (category as Record<string, unknown>)
              : {};
          return {
            id: String(record.id ?? ""),
            name: String(record.name ?? ""),
          };
        })
        .filter((category) => category.id && category.name)
    : [];

  const fallbackCategories = categories.length
    ? categories
    : rawSections.some((section) => {
        const record =
          section && typeof section === "object" ? (section as Record<string, unknown>) : {};
        return Array.isArray(record.questions) && record.questions.length > 0;
      })
      ? [{ id: GENERAL_CATEGORY_ID, name: GENERAL_CATEGORY_NAME }]
      : [];

  const sections = rawSections.map((section) => {
    const record = section && typeof section === "object" ? (section as Record<string, unknown>) : {};
    const legacyQuestions = Array.isArray(record.questions) ? record.questions : [];
    const rawCategoryQuestions = Array.isArray(record.categoryQuestions)
      ? record.categoryQuestions
      : [];

    return {
      id: String(record.id ?? ""),
      title: String(record.title ?? ""),
      categoryQuestions: fallbackCategories.map((category) => {
        const matchingGroup = rawCategoryQuestions.find((group) => {
          const groupRecord =
            group && typeof group === "object" ? (group as Record<string, unknown>) : {};
          return String(groupRecord.categoryId ?? "") === category.id;
        });

        const groupRecord =
          matchingGroup && typeof matchingGroup === "object"
            ? (matchingGroup as Record<string, unknown>)
            : {};

        const sourceQuestions = Array.isArray(groupRecord.questions)
          ? groupRecord.questions
          : category.id === GENERAL_CATEGORY_ID
            ? legacyQuestions
            : [];

        return {
          categoryId: category.id,
          questions: sourceQuestions.map(normalizeQuestion),
        };
      }),
    };
  });

  return {
    categories: fallbackCategories,
    sections,
  };
}
