import { LoginData, UserData } from 'types/types';
import { accountModel } from './model';

const createAccountService = () => {

  const getAccount = async( email: string ) => {
    const user = accountModel.findOne( {email: email} );

    return user;
  }

  const loginAccount = async( email: string, data: UserData ) => {
    const doc = await accountModel.findOneAndUpdate( {email: email}, data );
  }

  const addAccount = async( user: LoginData ) => {
    const u = new accountModel( {...user} );
    let docId: string|undefined = undefined;

    console.log( u );

    return u.save();
  }

  const updateAccount = async( user: LoginData ) => {
    const doc = await accountModel.findOneAndUpdate( {email: user.email}, user );
  }

  return {
    getAccount,
    loginAccount,
    addAccount,
    updateAccount,
  }
}

export const accountService = createAccountService();