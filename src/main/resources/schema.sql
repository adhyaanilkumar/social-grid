-- Runs after Hibernate has created/updated the tables (see spring.jpa.defer-datasource-initialization).
-- Hibernate only creates foreign keys for @ManyToOne associations, and the entities hold plain post ids,
-- so the constraints are declared here. Dropping first makes the script safe to run on every startup.

-- A comment or like can only reference an existing post; deleting the post deletes them with it.
ALTER TABLE comments DROP CONSTRAINT IF EXISTS fk_comments_post;
ALTER TABLE comments ADD CONSTRAINT fk_comments_post
    FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE;

ALTER TABLE likes DROP CONSTRAINT IF EXISTS fk_likes_post;
ALTER TABLE likes ADD CONSTRAINT fk_likes_post
    FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE;

-- A post's photo goes when the post goes.
ALTER TABLE post_images DROP CONSTRAINT IF EXISTS fk_post_images_post;
ALTER TABLE post_images ADD CONSTRAINT fk_post_images_post
    FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE;
