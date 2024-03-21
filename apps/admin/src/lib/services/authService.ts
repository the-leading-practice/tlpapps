import type { LoginData } from "$lib/types/common"



const createAuthService = () => {
  const getUserByEmail = async( email: string ) => {
    return { 
      email: "mike@uglyyellowbunny.com",
      password: "testpassword",
      user:{
        firstName: "Michael",
        lastName: "Heien"
      }
    }
  }

  const addUser = async( user: LoginData ) => {

  }

  const updateUser = async( user: LoginData ) => {

  }

  return {
    getUserByEmail,
    addUser,
    updateUser
  }
}

export const authService = createAuthService();