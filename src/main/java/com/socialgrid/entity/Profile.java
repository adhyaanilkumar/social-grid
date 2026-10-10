package com.socialgrid.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

// One profile per user. @MapsId makes the profile's primary key the same value as the user's id.
@Entity
@Table(name = "profiles")
public class Profile {

    @Id
    private Integer userId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    private String firstName;
    private String lastName;

    @Column(length = 500)
    private String bio;

    private String profilePicUrl;

    protected Profile() {
    }

    public Profile(User user) {
        this.user = user;
    }

    public Integer getUserId() {
        return userId;
    }

    public String getUsername() {
        return user.getUsername();
    }

    public void setUsername(String username) {
        user.setUsername(username);
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstname(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastname(String lastName) {
        this.lastName = lastName;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public String getProfilePic() {
        return profilePicUrl;
    }

    public void setProfilePic(String profilePicUrl) {
        this.profilePicUrl = profilePicUrl;
    }
}
