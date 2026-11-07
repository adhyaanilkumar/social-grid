# Intent: social-grid MVP (V0 cycle)
Author: adhyaanilkumar. Cycle: V0. Status: approved.

## Problem
A user can register and log in, but then reaches a placeholder page that says "Your feed will appear here".
Posts, comments, likes, follows and profiles exist in the backend but have no screens, and no endpoint returns a feed. Today the app can't be used as a social network.

## Proposed outcome
A deployed MVP where a logged-in user can:
- Create a post by uploading a photo with an optional caption, and delete their own posts.
- Use the Home tab to see their own posts and the posts of the people they follow.
- Use the Explore tab to see everyone's posts, including their own, newest first.
- Use a search bar to find other users by username.
- View any user's profile, and follow or unfollow them from it.
- Like posts, comment on them, and delete their own comments.
- View their own profile, showing their number of posts, followers and following.

## Affected users and systems
Registered users.
Frontend: the Home page placeholder is replaced by the Home feed, plus new Explore, search, post, like, comment and profile screens.
Backend: new endpoints for the Home feed, Explore feed, user search and unfollow, and post, follower and following counts on the profile (not returned today).
Database: existing users, profiles, posts, comments, likes and follows tables, plus storage for uploaded photos.
Tests: JUnit, pytest and Playwright coverage for the new behaviour (pytest covers only register and login today).
Hosting: a platform for the frontend, backend and database (none exists today).

## Constraints
Existing session login only.
Stack as set in CLAUDE.md: Spring Boot (Entity, Repository, Service, Controller layers), React, Postgres, Docker.
Personal project: hosting only needs to be simple and work.
Explore and all other MVP features are for logged-in users only.
Users can delete only their own posts and comments. There are no moderator powers.
Out of scope for this cycle: hashtags, and editing posts or comments.

## Open questions
Which hosting platform? To be decided at the deployment stage. Vercel can host the React frontend, but not the Spring Boot backend or Postgres, so those would need a separate host.
