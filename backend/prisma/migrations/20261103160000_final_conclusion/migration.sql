INSERT INTO "AssessmentQuestion" ("tahap", "pertanyaan", "is_header", "urutan", "question_title_override", "is_active", "satker_lock_mode")
SELECT 2, 'H. Kesimpulan', FALSE, COALESCE(MAX("urutan"), -1) + 1, '__FINAL_CONCLUSION__', TRUE, 'ROW'
FROM "AssessmentQuestion"
WHERE "tahap" = 2
HAVING NOT EXISTS (SELECT 1 FROM "AssessmentQuestion" WHERE "tahap" = 2 AND "question_title_override" = '__FINAL_CONCLUSION__');
