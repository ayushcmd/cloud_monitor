from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse,
)
from app.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter()

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register New User Account"
)
def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """Registers a new user account with unique email and securely hashed password."""
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already registered."
        )

    hashed = hash_password(payload.password)
    user = User(
        email=payload.email,
        password_hash=hashed
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login & JWT Token Issuance"
)
def login_user(
    payload: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """Authenticates user credentials and issues a signed JWT Bearer access token."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id}
    )
    return TokenResponse(access_token=access_token, token_type="bearer")

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Authenticated User Profile"
)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Returns the authenticated user's profile information."""
    return current_user
