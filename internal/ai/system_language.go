package ai

import "strings"

type aiSystemLanguagePreference struct {
	Locale      string
	DisplayName string
}

func getAISystemLanguagePreference() aiSystemLanguagePreference {
	locale := normalizeAISystemLocale(detectAISystemLocale())
	if locale == "" {
		return aiSystemLanguagePreference{}
	}
	return aiSystemLanguagePreference{
		Locale:      locale,
		DisplayName: describeAISystemLocale(locale),
	}
}

func normalizeAISystemLocale(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if separator := strings.Index(trimmed, ":"); separator >= 0 {
		trimmed = trimmed[:separator]
	}
	if separator := strings.IndexAny(trimmed, ".@"); separator >= 0 {
		trimmed = trimmed[:separator]
	}
	trimmed = strings.ReplaceAll(trimmed, "_", "-")
	parts := strings.Split(trimmed, "-")
	if len(parts) == 0 {
		return ""
	}
	language := strings.ToLower(strings.TrimSpace(parts[0]))
	if language == "" {
		return ""
	}
	if len(parts) == 1 {
		return language
	}
	region := strings.ToUpper(strings.TrimSpace(parts[1]))
	if region == "" {
		return language
	}
	return language + "-" + region
}

func describeAISystemLocale(locale string) string {
	normalized := normalizeAISystemLocale(locale)
	switch {
	case normalized == "":
		return ""
	case normalized == "zh-CN", normalized == "zh-SG":
		return "Simplified Chinese"
	case normalized == "zh-TW", normalized == "zh-HK", normalized == "zh-MO":
		return "Traditional Chinese"
	case normalized == "zh" || strings.HasPrefix(normalized, "zh-"):
		return "Chinese"
	case normalized == "en" || strings.HasPrefix(normalized, "en-"):
		return "English"
	case normalized == "ja" || strings.HasPrefix(normalized, "ja-"):
		return "Japanese"
	case normalized == "ko" || strings.HasPrefix(normalized, "ko-"):
		return "Korean"
	case normalized == "fr" || strings.HasPrefix(normalized, "fr-"):
		return "French"
	case normalized == "de" || strings.HasPrefix(normalized, "de-"):
		return "German"
	case normalized == "es" || strings.HasPrefix(normalized, "es-"):
		return "Spanish"
	case normalized == "ru" || strings.HasPrefix(normalized, "ru-"):
		return "Russian"
	case normalized == "pt" || strings.HasPrefix(normalized, "pt-"):
		return "Portuguese"
	case normalized == "it" || strings.HasPrefix(normalized, "it-"):
		return "Italian"
	default:
		return normalized
	}
}