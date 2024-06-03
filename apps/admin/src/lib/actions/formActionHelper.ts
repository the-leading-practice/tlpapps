import { addToast } from '$lib/components/Toast';
import { createEventDispatcher } from 'svelte';

export interface ValidationResponse {
	passed: boolean;
	message?: string;
};

export type ValidationFunction = {[key:string]:(elem: HTMLInputElement)=>ValidationResponse};

export interface FormActionSettings {
  action: string,
  method: string,
  isJson: boolean,
  validation?: ValidationFunction;
  onSuccess?: ( res: Response ) => void;
  onError?: ( error: any ) => void;
	onSubmit?: () => void;
  headers?: Headers,
}

export const formActionHelper = ( form: FormActionSettings ) => {
  const formData: {[key:string]: string} = {};

  const bindData = ( node: any, validation: ValidationFunction = {} ) => {
		let failed: any[] = [];
    [...node.querySelectorAll( 'input,select,textarea,[include]' ) ].forEach( (elem) => {
      if( validation[elem.name] ) {
        let ret = validation[elem.name]( elem ); 
				if( !ret.passed ){
          failed.push(  {
						passed: false,
						element: elem.name,
						message: ret.message
					} );
					return;
        }
      } else if( elem.hasAttribute( 'required' ) ) {
				// basic check to make sure it has data
				if( elem.value.length <= 0 ) {
					failed.push(  {
						passed: false,
						element: elem.name
					} );
				}
			}

      formData[elem.name] = elem.value;
    } );

		return failed;
  }

  return {
    data: formData,
    formAction: ( node: HTMLElement ) => {

			const handleSubmit = ( event: SubmitEvent ) => {
				event.preventDefault();
				let failed = bindData( node, form.validation );

				if( failed.length > 0 ) {
					if( form.onError ) form.onError( failed );
					return;
				}

				if( form.onSubmit ) form.onSubmit();
			}
    
      node.addEventListener( 'submit', handleSubmit );

      return {
        destroy: () => {
          node.removeEventListener( "submit", handleSubmit );
        }
      }
    }
	}
}