ALTER TABLE member ADD COLUMN real_name text;
ALTER TABLE member ADD COLUMN class_name text;
ALTER TABLE member ADD COLUMN directions jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE member
SET directions = to_jsonb(string_to_array(direction, '、'))
WHERE direction IS NOT NULL AND btrim(direction) <> '';

ALTER TABLE member ADD CONSTRAINT member_real_name_length_check
  CHECK (real_name IS NULL OR char_length(btrim(real_name)) BETWEEN 1 AND 80);
ALTER TABLE member ADD CONSTRAINT member_student_number_length_check
  CHECK (student_number IS NULL OR char_length(btrim(student_number)) BETWEEN 1 AND 32);
ALTER TABLE member ADD CONSTRAINT member_class_name_format_check
  CHECK (class_name IS NULL OR class_name ~ '^[A-Za-z一-鿿]{2,20}[0-9]{2}-[1-9][0-9]?$');
ALTER TABLE member ADD CONSTRAINT member_directions_array_check
  CHECK (jsonb_typeof(directions) = 'array' AND jsonb_array_length(directions) <= 8);
CREATE UNIQUE INDEX member_student_number_unique ON member(student_number) WHERE student_number IS NOT NULL;
