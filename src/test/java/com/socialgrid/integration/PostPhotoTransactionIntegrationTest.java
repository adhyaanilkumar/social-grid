package com.socialgrid.integration;

import com.socialgrid.entity.PostImage;
import com.socialgrid.repository.PostImageRepository;
import com.socialgrid.service.ImageService;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

// Spec 4.2: post and photo are saved in one transaction, "so a post can't exist without its photo".
class PostPhotoTransactionIntegrationTest extends PostgresIntegrationTest {

    @MockitoSpyBean
    private PostImageRepository postImageRepository;

    @Test
    void whenThePhotoFailsToSaveThePostIsRolledBack() {
        Integer alice = user("alice");
        doThrow(new IllegalStateException("disk full")).when(postImageRepository).save(any(PostImage.class));

        assertThatThrownBy(() -> postService.createPost(alice, new ImageService.ProcessedImage(JPEG, 640, 480), "hi"))
                .isInstanceOf(IllegalStateException.class);

        assertThat(rows("posts", "author_id", alice)).isZero();
    }
}
