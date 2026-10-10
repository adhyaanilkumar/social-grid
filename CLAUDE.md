# [CLAUDE.md](http://CLAUDE.md)

# Tech Stack

- Always use the following tech Stack for this project
  - Backend: Java SpringBoot
  - Frontend: React
  - Database: PostGres
  - Containerization: Docker
  - Version Control : Git
- Always use the following testing stack for this application
  - White Box Automation: JUnit
  - Black Box Automation: pytest
  - UI testing: Playwright

# Class Diagram

- Always follow the given class diagram for the backend implementation of the project  
classDiagram  
class User{  
- id: int  
- username: String  
- password: Hash  
- email: String  
+ getid() int  
+ getUserName() String  
+ setUsername() String  
}  
class profile{  
- first_name: String  
- last_name: String  
- bio: String  
- profile_pic_url: String  
+ getUsername() String  
+ getProfilePic() String  
+ setUsername() String  
+ setFirstname() String  
+ setLastname() String  
+ setBio() String  
+ setProfilePic() String  
}  
class Like{  
- LikeId: LikeId  
+ getLikeId() LikeId  
}  
class Comment{  
- CommentId: int  
- authorId: int  
- PostId: int  
- message: String  
+ getMessage() String  
+ setMessage()  
}  
class Post{  
- PostId: int  
- authorid: int  
- media_url: String  
- caption: String  
+ getMediaURL(): String  
+ getCaption(): String  
}  
class FollowId{  
- FollowerId: int  
- FolloweeId: int  
}  
class LikeId{  
- PostId: int  
- UserId: int  
}  
class Follows{  
- id: FollowId   
}  
class LikeService <>{  
+ createLike(): Like  
+ deleteLike()   
}  
class UserService <>{  
+ login()  
+ register()  
+ UpdateProfile()  
+ UpdateEmail()   
}  
class CommentService <>{  
+ createComment()  
+ updateMessage()  
+ deleteComment()  
}  
class PostService <>{  
+ createPost()  
+ updatePost()  
+ deletePost()  
}  
class FollowService <>{  
+follow()  
}  
User "1"<.. "1"profile  
User "1"<.. ""LikeService  
User "1"<.. ""PostService  
User "1"<.. "1"UserService  
User "1"<.. ""FollowService  
User "1"<.. ""CommentService  
Post "1"-- ""Like  
Post "1"-- ""Comment  
Follows "1"<|--"1" FollowId  
Like "1"<|--"1" LikeId  
LikeId ""<--"1" User  
FollowId ""<--"1" User  
Comment "*"<--"1" User



# Code Design

- Always implement the backend in Springboot using Entity, Repository, Service and Controller Layers.
- Dont worry about Frontend and High Level Design Concepts yet. We are designing a workable model for the time being.

